const mongoose = require('mongoose');
const logger = require('../utility/logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error('MongoDB connection failed:', error.message || error.toString() || 'Unknown error');
    console.error('Full error object:', error);
    process.exit(1);
  }
};

module.exports = connectDB;