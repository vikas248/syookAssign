# Syook Assignment - Encrypted Message Processing

Built a real-time message streaming system with encryption and data validation. One service generates encrypted message streams, another receives and processes them.

## What this does

I created two services that communicate via Socket.IO:

**Emitter** - generates random travel messages (name, origin, destination), creates SHA-256 hashes for integrity, encrypts everything with AES-256-CTR, and sends batches of 49-499 messages every 10 seconds.

**Listener** - receives encrypted streams, decrypts each message, validates the hash to ensure data wasn't tampered with, and stores valid messages in MongoDB with timestamps.

The data gets organized in a time-series schema where each document represents a minute and contains all messages received in that timeframe for efficient querying.

## Running the system

### Requirements
- Node.js 16+
- MongoDB running locally
- Git

### Setup

1. Clone and install:
```bash
git clone https://github.com/vikas248/syookAssign.git
cd syookAssign
npm install
```

2. Start MongoDB:
```bash
brew services start mongodb/brew/mongodb-community
```

3. Create `.env` file:
```env
MONGO_URI=mongodb://localhost:27017/syook-assignment
LISTENER_PORT=3001
ENCRYPTION_KEY=syook-default-secret-key-32chars!!
NODE_ENV=development
```

4. Run both services:
```bash
npm run services
```

Or run separately:
```bash
# Terminal 1
npm run listener:dev

# Terminal 2  
npm run emitter:dev
```

## How it works

The flow is pretty straightforward:

1. Emitter generates random messages from data in `data.json`
2. Creates SHA-256 hash of each message for integrity verification
3. Encrypts the message+hash using AES-256-CTR 
4. Joins 49-499 encrypted messages with `|` separator
5. Sends stream via Socket.IO to listener
6. Listener splits the stream, decrypts each message
7. Validates integrity using the hash
8. Saves valid messages to MongoDB with timestamp

Invalid messages get discarded and processing continues.

## Monitoring

Check system status with curl:

```bash
# Health check - shows if system is running
curl http://localhost:3001/health

# Processing statistics - message counts and performance  
curl http://localhost:3001/stats

# Recent data (last 10 entries by default)
curl http://localhost:3001/recent-data

# Get specific number of recent entries
curl http://localhost:3001/recent-data?limit=5

```

Expected responses:
```json
// Health check response
{
  "status": "healthy",
  "service": "listener", 
  "connectedEmitters": 1,
  "uptime": 245.123
}

// Stats response  
{
  "processingStats": {
    "totalReceived": 1247,
    "totalProcessed": 1247,
    "totalValid": 1245,
    "totalInvalid": 2,
    "totalSaved": 1245
  },
  "connectedEmitters": [...]
}
```

Or just open these URLs in your browser.

## Testing

Run the crypto tests to verify everything works:
```bash
npm run test-crypto
```

Should see all tests pass for encryption/decryption, hashing, and message validation.

## Configuration

Environment variables in `.env`:
- `MONGO_URI` - MongoDB connection string
- `LISTENER_PORT` - Port for listener service (default 3001)
- `ENCRYPTION_KEY` - 32-char key for AES encryption
- `NODE_ENV` - Environment mode

## Technical details

- **Encryption**: AES-256-CTR with random IV per message
- **Integrity**: SHA-256 hash of original message data
- **Communication**: Socket.IO for real-time streaming
- **Storage**: MongoDB time-series schema (groups by minute)
- **Messages**: 49-499 per batch, sent every 10 seconds
- **Data**: Random Indian names/cities from JSON file

## Error handling

The system handles various failure scenarios:
- Network disconnections (auto-reconnect)
- Invalid/corrupted messages (discard and continue)
- MongoDB connection issues (retry with backoff)
- Service crashes (graceful shutdown)

Both services log everything to files in `/logs` and console in development mode.

## Issues & troubleshooting

**MongoDB connection failed**: Make sure MongoDB is running
```bash
brew services start mongodb/brew/mongodb-community
```

**Port already in use**: Change `LISTENER_PORT` in `.env` or kill the process using that port

**npm install fails**: Clear npm cache and retry
```bash
npm cache clean --force
npm install
```

This handles the core requirements - generates encrypted message streams with integrity validation, real-time socket communication, and time-series data storage. The emitter sends random travel data every 10 seconds, listener validates and stores everything in MongoDB.

Built by Vikas Shukla - [GitHub](https://github.com/vikas248/syookAssign)