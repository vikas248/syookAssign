require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('../../config/db');
const { decrypt, validateSecretKey } = require('../../utility/crypto');
const { parseMessageStream } = require('../../utility/messageGenerator');
const TimeSeriesData = require('../../models/TimeSeriesData');
const logger = require('../../utility/logger');

class ListenerService {
  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.connectedEmitters = new Map();
    this.processingStats = {
      totalReceived: 0,
      totalProcessed: 0,
      totalValid: 0,
      totalInvalid: 0,
      totalSaved: 0,
      errors: 0
    };
    
    this.setupRoutes();
    this.setupSocketHandlers();
  }
  
  setupRoutes() {
    this.app.use(express.json());
    
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'listener',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        connectedEmitters: this.connectedEmitters.size,
        processingStats: this.processingStats
      });
    });

    this.app.get('/stats', (req, res) => {
      res.json({
        processingStats: this.processingStats,
        connectedEmitters: Array.from(this.connectedEmitters.entries()).map(([id, info]) => ({
          id,
          ...info
        }))
      });
    });

    this.app.get('/recent-data', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const recentData = await TimeSeriesData.find()
          .sort({ timestamp: -1 })
          .limit(limit)
          .select('minuteBucket timestamp recordCount routes nameFrequency');
        
        res.json(recentData);
      } catch (error) {
        logger.error('Failed to fetch recent data:', error.message);
        res.status(500).json({ error: 'Failed to fetch recent data' });
      }
    });
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`New emitter connected: ${socket.id} from ${socket.handshake.address}`);
      
      this.connectedEmitters.set(socket.id, {
        connectedAt: new Date().toISOString(),
        address: socket.handshake.address,
        messagesReceived: 0,
        lastMessageAt: null
      });

      socket.on('encrypted_message_stream', async (data) => {
        await this.handleMessageStream(socket, data);
      });

      socket.on('disconnect', (reason) => {
        logger.info(`Emitter disconnected: ${socket.id}, reason: ${reason}`);
        this.connectedEmitters.delete(socket.id);
      });

      socket.on('error', (error) => {
        logger.error(`Socket error from ${socket.id}:`, error.message);
      });
    });
  }

  async handleMessageStream(socket, data) {
    const startTime = Date.now();
    const emitterInfo = this.connectedEmitters.get(socket.id);
    
    try {
      logger.info(`Got message stream from ${socket.id} with ${data.messageCount} messages`);

      if (emitterInfo) {
        emitterInfo.messagesReceived++;
        emitterInfo.lastMessageAt = new Date().toISOString();
      }

      const encryptedMessages = parseMessageStream(data.stream);
      this.processingStats.totalReceived += encryptedMessages.length;

      const results = {
        messageCount: encryptedMessages.length,
        processedCount: 0,
        validCount: 0,
        invalidCount: 0,
        savedCount: 0,
        errors: []
      };

      for (let i = 0; i < encryptedMessages.length; i++) {
        try {
          const result = await this.processEncryptedMessage(encryptedMessages[i], i);
          
          results.processedCount++;
          
          if (result.valid) {
            results.validCount++;
            if (result.saved) {
              results.savedCount++;
            }
          } else {
            results.invalidCount++;
          }
          
        } catch (error) {
          results.errors.push({
            messageIndex: i,
            error: error.message
          });
          logger.error(`Error processing message ${i}:`, error.message);
        }
      }

      this.processingStats.totalProcessed += results.processedCount;
      this.processingStats.totalValid += results.validCount;
      this.processingStats.totalInvalid += results.invalidCount;
      this.processingStats.totalSaved += results.savedCount;
      this.processingStats.errors += results.errors.length;

      const processingTime = Date.now() - startTime;
      results.processingTime = processingTime;
      results.timestamp = new Date().toISOString();

      logger.info(`Processed message stream in ${processingTime}ms:`, {
        processed: results.processedCount,
        valid: results.validCount,
        invalid: results.invalidCount,
        saved: results.savedCount,
        errors: results.errors.length
      });

      socket.emit('message_received', results);

    } catch (error) {
      logger.error('Failed to handle message stream:', error.message);
      
      socket.emit('processing_error', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async processEncryptedMessage(encryptedMessage, index) {
    try {
      const decryptedString = decrypt(encryptedMessage);
      const messageWithKey = JSON.parse(decryptedString);
      
      const isValid = validateSecretKey(messageWithKey);
      
      if (!isValid) {
        logger.warn(`Invalid secret_key for message ${index}, discarding`);
        return { valid: false, saved: false, reason: 'Invalid secret key' };
      }

      const { secret_key, ...originalMessage } = messageWithKey;
      
      const savedRecord = await TimeSeriesData.addRecord(originalMessage);
      
      logger.debug(`Successfully saved message ${index}:`, {
        name: originalMessage.name,
        route: `${originalMessage.origin}->${originalMessage.destination}`,
        minuteBucket: savedRecord.minuteBucket
      });

      return { 
        valid: true, 
        saved: true, 
        data: originalMessage,
        minuteBucket: savedRecord.minuteBucket 
      };

    } catch (error) {
      logger.error(`Failed to process encrypted message ${index}: ${error.message}`);
      return { 
        valid: false, 
        saved: false, 
        reason: error.message 
      };
    }
  }

  async start() {
    try {
      await connectDB();
      logger.info('MongoDB connected successfully');

      this.server.listen(this.port, () => {
        logger.info(`Listener Service started on port ${this.port}`);
        logger.info(`Socket.IO server ready to accept connections`);
        logger.info(`Health check available at http://localhost:${this.port}/health`);
        logger.info(`Statistics available at http://localhost:${this.port}/stats`);
      });

      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start Listener Service:', error.message);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const gracefulShutdown = () => {
      logger.info('Received shutdown signal, closing server gracefully...');
      
      this.server.close(() => {
        logger.info('HTTP server closed');
        
        this.io.close(() => {
          logger.info('Socket.IO server closed');
          
          require('mongoose').connection.close();
          logger.info('MongoDB connection closed');
          logger.info('Listener Service shut down complete');
          process.exit(0);
        });
      });

      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }

  getStatus() {
    return {
      port: this.port,
      connectedEmitters: this.connectedEmitters.size,
      processingStats: this.processingStats,
      uptime: process.uptime()
    };
  }
}

if (require.main === module) {
  const port = process.env.LISTENER_PORT || 3001;
  const listenerService = new ListenerService(port);
  
  listenerService.start();
}

module.exports = ListenerService;