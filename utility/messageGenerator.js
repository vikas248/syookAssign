const fs = require('fs');
const path = require('path');
const { createHash, encrypt } = require('./crypto');
const logger = require('./logger');

// Load data from data.json
let dataCache = null;

// Loads data from data.json file
function loadData() {
  if (dataCache) {
    return dataCache;
  }
  
  try {
    const dataPath = path.join(__dirname, '../data.json');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    dataCache = JSON.parse(rawData);
    
    logger.info(`Loaded data: ${dataCache.names.length} names, ${dataCache.origins.length} origins, ${dataCache.destinations.length} destinations`);
    return dataCache;
  } catch (error) {
    logger.error('Failed to load data.json:', error.message);
    throw error;
  }
}

// Gets a random element from an array
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Generates a random message with name, origin, destination
function generateRandomMessage() {
  const data = loadData();
  
  return {
    name: getRandomElement(data.names),
    origin: getRandomElement(data.origins),
    destination: getRandomElement(data.destinations)
  };
}

// Creates a message with secret_key hash
function createMessageWithHash(originalMessage) {
  const secret_key = createHash(originalMessage);
  
  return {
    ...originalMessage,
    secret_key
  };
}

// generate random batch of messages (49-499 as per requirements)
function generateMessageBatch() {
  const messageCount = Math.floor(Math.random() * (499 - 49 + 1)) + 49; 
  const encryptedMessages = [];
  
  logger.info(`Generating ${messageCount} messages`);
  
  for (let i = 0; i < messageCount; i++) {
    try {
      const originalMessage = generateRandomMessage();
      
      const messageWithHash = createMessageWithHash(originalMessage);
      
      const encryptedMessage = encrypt(JSON.stringify(messageWithHash));
      
      encryptedMessages.push(encryptedMessage);
    } catch (error) {
      logger.error(`Failed to generate message ${i + 1}:`, error.message);
    }
  }
  
  return encryptedMessages;
}

// Creates a pipe-separated stream of encrypted messages
function createMessageStream() {
  try {
    const encryptedMessages = generateMessageBatch();
    const messageStream = encryptedMessages.join('|');
    
    logger.info(`Created message stream with ${encryptedMessages.length} messages, total length: ${messageStream.length} characters`);
    
    return messageStream;
  } catch (error) {
    logger.error('Failed to create message stream:', error.message);
    throw error;
  }
}

// Parses a pipe-separated message stream into individual encrypted messages
function parseMessageStream(messageStream) {
  try {
    if (!messageStream || typeof messageStream !== 'string') {
      throw new Error('Invalid message stream format');
    }
    
    const messages = messageStream.split('|').filter(msg => msg.trim().length > 0);
    logger.info(`Parsed ${messages.length} messages from stream`);
    
    return messages;
  } catch (error) {
    logger.error('Failed to parse message stream:', error.message);
    throw error;
  }
}

module.exports = {
  loadData,
  generateRandomMessage,
  createMessageWithHash,
  generateMessageBatch,
  createMessageStream,
  parseMessageStream
};