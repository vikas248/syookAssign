require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const logger = require('./utility/logger');
const bodyParser = require('body-parser');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
const path = require('path');

app.use(express.json());
app.use(cookieParser());

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'frontend')));

connectDB();

app.use(bodyParser.urlencoded({ extended: true }));

const allowedOrigins = [
  'http://localhost:8000',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// app.use(cors({
//   origin: "*",  
//   credentials: true
// }));

// Routes
app.use('/api/auth', require('./routes/allRoutes/index'));

// Root route - serve frontend index
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

// Global error handler
app.use((err, req, res, next) => {
  logger.error(err.stack || err.message);
  res.status(500).json({
    status: false,
    message: 'Something went wrong!',
    error: err.message
  });
});