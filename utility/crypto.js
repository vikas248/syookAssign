const crypto = require('crypto');
const logger = require('./logger');

const ALGORITHM = 'aes-256-ctr';
const SECRET_KEY = process.env.ENCRYPTION_KEY || 'syook-default-secret-key-32chars!!'; 
const IV_LENGTH = 16; // AES block size

// Encrypts a message using AES-256-CTR
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(SECRET_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const result = iv.toString('hex') + ':' + encrypted;
    
    return result;
  } catch (error) {
    logger.error('Encryption failed:', error.message);
    throw error;
  }
}

// Decrypts a message using AES-256-CTR
function decrypt(encryptedText) {
  try {
    const textParts = encryptedText.split(':');
    if (textParts.length !== 2) {
      throw new Error('Invalid encrypted text format');
    }
    
    const iv = Buffer.from(textParts[0], 'hex');
    const encrypted = textParts[1];
    
    const key = crypto.scryptSync(SECRET_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Decryption failed:', error.message);
    throw error;
  }
}

// Creates SHA-256 hash of an object
function createHash(obj) {
  try {
    const sortedKeys = Object.keys(obj).sort();
    const objString = sortedKeys.map(key => `${key}:${obj[key]}`).join('|');
    
    const hash = crypto.createHash('sha256');
    hash.update(objString);
    
    return hash.digest('hex');
  } catch (error) {
    logger.error('Hash creation failed:', error.message);
    throw error;
  }
}

// Validates if the secret_key matches the hash of the original message
function validateSecretKey(messageWithKey) {
  try {
    const { secret_key, ...originalMessage } = messageWithKey;
    const expectedHash = createHash(originalMessage);
    
    return secret_key === expectedHash;
  } catch (error) {
    logger.error('Secret key validation failed:', error.message);
    return false;
  }
}

module.exports = {
  encrypt,
  decrypt,
  createHash,
  validateSecretKey
};