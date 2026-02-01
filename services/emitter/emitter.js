require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const io = require('socket.io-client');
const { createMessageStream } = require('../../utility/messageGenerator');
const logger = require('../../utility/logger');

class EmitterService {
  constructor(listenerHost = 'localhost', listenerPort = 3001) {
    this.listenerUrl = `http://${listenerHost}:${listenerPort}`;
    this.socket = null;
    this.intervalId = null;
    this.isConnected = false;
    this.messageInterval = 10000; 
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10; 
    this.reconnectInterval = 5000;
  }

  // Initialize and start the emitter service
  start() {
    logger.info(`Starting Emitter Service - connecting to ${this.listenerUrl}`);
    this.connect();
  }

  // Connect to the listener service via socket
  connect() {
    try {
      this.socket = io(this.listenerUrl, {
        timeout: 5000,
        reconnection: false
      });

      this.setupSocketEventHandlers();
      
    } catch (error) {
      logger.error('Failed to create socket connection:', error.message);
      this.scheduleReconnect();
    }
  }

  // Setup socket event handlers
  setupSocketEventHandlers() {
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info(`Connected to Listener Service at ${this.listenerUrl}`);
      logger.info('Socket ID:', this.socket.id);
      
      this.startPeriodicMessaging();
    });

    this.socket.on('connect_error', (error) => {
      logger.error('Socket connection error:', error.message);
      this.isConnected = false;
      this.scheduleReconnect();
    });

    // Disconnection
    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      logger.warn('Disconnected from Listener Service. Reason:', reason);
      
      this.stopPeriodicMessaging();
      
      if (reason !== 'io client disconnect') {
        this.scheduleReconnect();
      }
    });

    // Acknowledgment from listener
    this.socket.on('message_received', (data) => {
      logger.info('Listener acknowledged message receipt:', {
        messageCount: data.messageCount,
        processedCount: data.processedCount,
        validCount: data.validCount,
        invalidCount: data.invalidCount,
        timestamp: data.timestamp
      });
    });

    // Error from listener
    this.socket.on('processing_error', (error) => {
      logger.error('Listener reported processing error:', error);
    });

    // General socket error
    this.socket.on('error', (error) => {
      logger.error('Socket error:', error.message);
    });
  }

  // Start sending periodic messages
  startPeriodicMessaging() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    logger.info(`Starting periodic messaging every ${this.messageInterval / 1000} seconds`);
    
    this.sendMessageStream();
    
    this.intervalId = setInterval(() => {
      this.sendMessageStream();
    }, this.messageInterval);
  }

  // Stop periodic messaging
  stopPeriodicMessaging() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Stopped periodic messaging');
    }
  }

  // Generate and send encrypted message stream
  async sendMessageStream() {
    if (!this.isConnected || !this.socket) {
      logger.warn('Cannot send message - not connected to listener');
      return;
    }

    try {
      const startTime = Date.now();
      
      const messageStream = createMessageStream();
      const messageCount = messageStream.split('|').length;
      
      logger.info(`Sending message stream with ${messageCount} messages`);
      
      this.socket.emit('encrypted_message_stream', {
        stream: messageStream,
        timestamp: new Date().toISOString(),
        messageCount: messageCount
      });
      
      const processingTime = Date.now() - startTime;
      logger.info(`Message stream sent in ${processingTime}ms`);
      
    } catch (error) {
      logger.error('Failed to send message stream:', error.message);
    }
  }

  // Schedule a reconnection attempt
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping emitter.`);
      this.stop();
      return;
    }

    this.reconnectAttempts++;
    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectInterval / 1000} seconds`);
    
    setTimeout(() => {
      logger.info(`Reconnection attempt ${this.reconnectAttempts}...`);
      this.connect();
    }, this.reconnectInterval);
  }

  // Stop the emitter service
  stop() {
    logger.info('Stopping Emitter Service');
    
    this.stopPeriodicMessaging();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    logger.info('Emitter Service stopped');
  }

  // Get current status
  getStatus() {
    return {
      isConnected: this.isConnected,
      listenerUrl: this.listenerUrl,
      reconnectAttempts: this.reconnectAttempts,
      messageInterval: this.messageInterval,
      hasActiveInterval: !!this.intervalId
    };
  }
}

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  if (global.emitterService) {
    global.emitterService.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  if (global.emitterService) {
    global.emitterService.stop();
  }
  process.exit(0);
});

if (require.main === module) {
  const listenerHost = process.env.LISTENER_HOST || 'localhost';
  const listenerPort = process.env.LISTENER_PORT || 3001;
  
  const emitterService = new EmitterService(listenerHost, listenerPort);
  global.emitterService = emitterService;
  
  emitterService.start();
}

module.exports = EmitterService;