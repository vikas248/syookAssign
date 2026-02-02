const mongoose = require('mongoose');

// Time-series optimized schema for storing message data
// Groups data by minute intervals for optimal aggregation performance
// Each document represents one minute and contains multiple message records

const MessageRecordSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true, 
    index: true
  },
  origin: {
    type: String,
    required: true,
    index: true
  },
  destination: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  recordId: {
    type: String,
    required: true,
    unique: true // Ensures no duplicate records
  }
}, { _id: false }); // Disable _id for sub-documents to save space

// Main time series document schema
const TimeSeriesDataSchema = new mongoose.Schema({
  minuteBucket: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  
  yearMonth: {
    type: String,
    required: true,
    index: true
  },
  
  dateOnly: {
    type: String,
    required: true,
    index: true
  },
  
  hour: {
    type: Number,
    required: true,
    min: 0,
    max: 23,
    index: true
  },
  
  records: [MessageRecordSchema],
  
  recordCount: {
    type: Number,
    default: 0,
    index: true
  },
  
  routes: [{
    route: String, // "Mumbai->Delhi"
    count: Number
  }],
  
  nameFrequency: [{
    name: String,
    count: Number
  }],

  firstRecordTime: Date,
  lastRecordTime: Date,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
TimeSeriesDataSchema.index({ timestamp: 1, yearMonth: 1 });
TimeSeriesDataSchema.index({ dateOnly: 1, hour: 1 });
TimeSeriesDataSchema.index({ 'records.origin': 1, 'records.destination': 1 });
TimeSeriesDataSchema.index({ 'records.name': 1, timestamp: 1 });
TimeSeriesDataSchema.index({ recordCount: 1, timestamp: 1 });

// Static methods
TimeSeriesDataSchema.statics.createMinuteBucket = function(timestamp) {
  const date = new Date(timestamp);
  
  // Round down to the minute
  date.setSeconds(0, 0);
  
  return {
    minuteBucket: date.toISOString().substring(0, 16), // "2024-01-15T14:00"
    timestamp: date,
    yearMonth: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    dateOnly: date.toISOString().substring(0, 10),
    hour: date.getHours()
  };
};

TimeSeriesDataSchema.statics.addRecord = async function(messageData) {
  const timestamp = new Date();
  const bucketInfo = this.createMinuteBucket(timestamp);
  const recordId = `${timestamp.getTime()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const record = {
    ...messageData,
    timestamp,
    recordId
  };
  
  // Create route string for aggregation
  const route = `${messageData.origin}->${messageData.destination}`;
  
  try {
    // First try to find existing document
    let result = await this.findOne({ minuteBucket: bucketInfo.minuteBucket });
    
    if (result) {
      // Document exists, just add the record
      result = await this.findOneAndUpdate(
        { minuteBucket: bucketInfo.minuteBucket },
        {
          $push: { records: record },
          $inc: { recordCount: 1 },
          $set: { 
            lastRecordTime: timestamp,
            updatedAt: new Date()
          }
        },
        { new: true, runValidators: true }
      );
    } else {
      // Document doesn't exist, create new one
      result = await this.create({
        ...bucketInfo,
        records: [record],
        routes: [],
        nameFrequency: [],
        recordCount: 1,
        firstRecordTime: timestamp,
        lastRecordTime: timestamp,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Update aggregated data (routes and name frequency)
    await this.updateAggregatedData(bucketInfo.minuteBucket, route, messageData.name);
    
    return result;
  } catch (error) {
    throw new Error(`Failed to add record: ${error.message}`);
  }
};

TimeSeriesDataSchema.statics.updateAggregatedData = async function(minuteBucket, route, name) {
  try {
    // Update route frequency
    await this.updateOne(
      { 
        minuteBucket,
        'routes.route': route 
      },
      { 
        $inc: { 'routes.$.count': 1 } 
      }
    );
    
    // If route doesn't exist, add it
    await this.updateOne(
      { 
        minuteBucket,
        'routes.route': { $ne: route }
      },
      { 
        $push: { 
          routes: { route, count: 1 } 
        } 
      }
    );
    
    // Update name frequency
    await this.updateOne(
      { 
        minuteBucket,
        'nameFrequency.name': name 
      },
      { 
        $inc: { 'nameFrequency.$.count': 1 } 
      }
    );
    
    // If name doesn't exist, add it
    await this.updateOne(
      { 
        minuteBucket,
        'nameFrequency.name': { $ne: name }
      },
      { 
        $push: { 
          nameFrequency: { name, count: 1 } 
        } 
      }
    );
  } catch (error) {
    console.error('Error updating aggregated data:', error);
  }
};

// Query helper methods
TimeSeriesDataSchema.statics.getByTimeRange = function(startTime, endTime) {
  return this.find({
    timestamp: {
      $gte: new Date(startTime),
      $lte: new Date(endTime)
    }
  }).sort({ timestamp: 1 });
};

TimeSeriesDataSchema.statics.getHourlyAggregation = function(date) {
  const dateStr = new Date(date).toISOString().substring(0, 10);
  
  return this.aggregate([
    {
      $match: { dateOnly: dateStr }
    },
    {
      $group: {
        _id: '$hour',
        totalRecords: { $sum: '$recordCount' },
        documents: { $sum: 1 },
        avgRecordsPerMinute: { $avg: '$recordCount' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

TimeSeriesDataSchema.statics.getTopRoutes = function(startTime, endTime, limit = 10) {
  return this.aggregate([
    {
      $match: {
        timestamp: {
          $gte: new Date(startTime),
          $lte: new Date(endTime)
        }
      }
    },
    {
      $unwind: '$routes'
    },
    {
      $group: {
        _id: '$routes.route',
        totalCount: { $sum: '$routes.count' }
      }
    },
    {
      $sort: { totalCount: -1 }
    },
    {
      $limit: limit
    }
  ]);
};

module.exports = mongoose.model('TimeSeriesData', TimeSeriesDataSchema);