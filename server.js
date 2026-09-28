const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { MongoClient } = require('mongodb');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MongoDB Setup ─────────────────────────────────────────────
// Set MONGODB_URI in your Render environment variables
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set!');
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);
let projectsCol;

async function connectDB() {
  await client.connect();
  const db    = client.db('royal_eye_solar');
  projectsCol = db.collection('projects');
  console.log('✅ Connected to MongoDB Atlas');
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve static frontend files from the same folder
app.use(express.static(__dirname));

// ── API Routes ────────────────────────────────────────────────

// GET all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await projectsCol
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    // Strip MongoDB's _id, keep our own string id
    res.json(projects.map(({ _id, ...rest }) => rest));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST — create new project
app.post('/api/projects', async (req, res) => {
  try {
    const project = {
      id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...req.body,
    };
    await projectsCol.insertOne(project);
    const { _id, ...saved } = project;
    res.status(201).json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT — update existing project
app.put('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body, updatedAt: new Date().toISOString() };
    delete update.id; // don't overwrite the id field

    const result = await projectsCol.findOneAndUpdate(
      { id },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ error: 'Project not found' });
    const { _id, ...rest } = result;
    res.json(rest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE — remove project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const result = await projectsCol.deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Catch-all — serve index.html for any unknown route ────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start server ──────────────────────────────────────────────
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Royal Eye Solar Tracker running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to connect to MongoDB:', err);
    process.exit(1);
  });
