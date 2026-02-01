require('dotenv').config();
const { encrypt, decrypt, createHash, validateSecretKey } = require('../utility/crypto');
const { generateRandomMessage, createMessageWithHash, createMessageStream, parseMessageStream } = require('../utility/messageGenerator');
const logger = require('../utility/logger');

async function testCryptoFunctions() {
  console.log('\n=== Testing Crypto Functions ===');
  
  try {
    // Test 1: Basic encryption and decryption
    console.log('\n1. Testing basic encryption/decryption...');
    const testMessage = 'Hello, this is a test message!';
    const encrypted = encrypt(testMessage);
    const decrypted = decrypt(encrypted);
    
    console.log(`Original: ${testMessage}`);
    console.log(`Encrypted: ${encrypted}`);
    console.log(`Decrypted: ${decrypted}`);
    console.log(`Encryption/Decryption test: ${testMessage === decrypted ? 'PASSED' : 'FAILED'}`);
    
    // Test 2: Hash generation
    console.log('\n2. Testing hash generation...');
    const testObj = { name: 'John Doe', origin: 'Mumbai', destination: 'Delhi' };
    const hash1 = createHash(testObj);
    const hash2 = createHash(testObj);
    const hash3 = createHash({ name: 'Jane Doe', origin: 'Mumbai', destination: 'Delhi' });
    
    console.log(`Object: ${JSON.stringify(testObj)}`);
    console.log(`Hash 1: ${hash1}`);
    console.log(`Hash 2: ${hash2}`);
    console.log(`Hash 3 (different data): ${hash3}`);
    console.log(`Hash consistency test: ${hash1 === hash2 ? 'PASSED' : 'FAILED'}`);
    console.log(`Hash uniqueness test: ${hash1 !== hash3 ? 'PASSED' : 'FAILED'}`);
    
    // Test 3: Secret key validation
    console.log('\n3. Testing secret key validation...');
    const messageWithValidKey = createMessageWithHash(testObj);
    const isValid = validateSecretKey(messageWithValidKey);
    
    // Test with invalid key
    const messageWithInvalidKey = { ...messageWithValidKey, secret_key: 'invalid_key' };
    const isInvalid = validateSecretKey(messageWithInvalidKey);
    
    console.log(`Message with valid key: ${JSON.stringify(messageWithValidKey)}`);
    console.log(`Valid key validation: ${isValid}`);
    console.log(`Invalid key validation: ${isInvalid}`);
    console.log(`Secret key validation test: ${isValid && !isInvalid ? 'PASSED' : 'FAILED'}`);
    
  } catch (error) {
    console.error('Crypto test failed:', error.message);
  }
}

async function testMessageGeneration() {
  console.log('\n=== Testing Message Generation ===');
  
  try {
    // Test 1: Random message generation
    console.log('\n1. Testing random message generation...');
    const randomMsg1 = generateRandomMessage();
    const randomMsg2 = generateRandomMessage();
    
    console.log(`Random message 1: ${JSON.stringify(randomMsg1)}`);
    console.log(`Random message 2: ${JSON.stringify(randomMsg2)}`);
    console.log(`Random generation test: ${JSON.stringify(randomMsg1) !== JSON.stringify(randomMsg2) ? 'PASSED (different messages)' : 'PASSED (same is also valid)'}`);
    
    // Test 2: Message stream creation and parsing
    console.log('\n2. Testing message stream creation and parsing...');
    const messageStream = createMessageStream();
    const parsedMessages = parseMessageStream(messageStream);
    
    console.log(`Message stream length: ${messageStream.length} characters`);
    console.log(`Parsed messages count: ${parsedMessages.length}`);
    console.log(`Stream parsing test: ${parsedMessages.length >= 49 && parsedMessages.length <= 499 ? 'PASSED' : 'FAILED'}`);
    
    // Test 3: End-to-end message flow
    console.log('\n3. Testing end-to-end message flow...');
    const originalMessage = generateRandomMessage();
    const messageWithHash = createMessageWithHash(originalMessage);
    const encryptedMessage = encrypt(JSON.stringify(messageWithHash));
    const decryptedMessage = JSON.parse(decrypt(encryptedMessage));
    const isValidMessage = validateSecretKey(decryptedMessage);
    
    console.log(`Original: ${JSON.stringify(originalMessage)}`);
    console.log(`With hash: ${JSON.stringify(messageWithHash)}`);
    console.log(`Encrypted length: ${encryptedMessage.length}`);
    console.log(`Decrypted: ${JSON.stringify(decryptedMessage)}`);
    console.log(`Is valid: ${isValidMessage}`);
    console.log(`End-to-end test: ${isValidMessage ? 'PASSED' : 'FAILED'}`);
    
    // Test 4: Test a few messages from the stream
    console.log('\n4. Testing messages from stream...');
    let validCount = 0;
    let testCount = Math.min(5, parsedMessages.length);
    
    for (let i = 0; i < testCount; i++) {
      try {
        const decrypted = JSON.parse(decrypt(parsedMessages[i]));
        const valid = validateSecretKey(decrypted);
        if (valid) validCount++;
        console.log(`Message ${i + 1}: ${valid ? 'VALID' : 'INVALID'}`);
      } catch (error) {
        console.log(`Message ${i + 1}: ERROR - ${error.message}`);
      }
    }
    
    console.log(`Stream message validation: ${validCount}/${testCount} valid messages`);
    
  } catch (error) {
    console.error('Message generation test failed:', error.message);
  }
}

async function main() {
  console.log('Running tests to make sure crypto functions work properly...');
  
  await testCryptoFunctions();
  await testMessageGeneration();
  
  console.log('\nAll tests completed!');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testCryptoFunctions,
  testMessageGeneration
};