const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Data file path ──────────────────────────────────────────
// On Render with a Persistent Disk mounted at /data,
// this keeps data across deploys. Locally it stores in the
// same folder as server.js.
const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]), 'utf8');

// ── Helpers ────────────────────────────────────────────────
function readProjects() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function writeProjects(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve static frontend files from the same folder
app.use(express.static(__dirname));

// ── API Routes ────────────────────────────────────────────

// GET all projects
app.get('/api/projects', (req, res) => {
  res.json(readProjects());
});

// POST — create new project
app.post('/api/projects', (req, res) => {
  const projects = readProjects();
  const project  = {
    id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...req.body,
  };
  projects.unshift(project);   // newest first
  writeProjects(projects);
  res.status(201).json(project);
});

// PUT — update existing project
app.put('/api/projects/:id', (req, res) => {
  const projects = readProjects();
  const idx      = projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  projects[idx] = { ...projects[idx], ...req.body, updatedAt: new Date().toISOString() };
  writeProjects(projects);
  res.json(projects[idx]);
});

// DELETE — remove project
app.delete('/api/projects/:id', (req, res) => {
  let projects = readProjects();
  const len    = projects.length;
  projects     = projects.filter(p => p.id !== req.params.id);
  if (projects.length === len) return res.status(404).json({ error: 'Project not found' });
  writeProjects(projects);
  res.json({ success: true });
});

// ── Catch-all — serve index.html for any unknown route ───
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start server ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Royal Eye Solar Tracker running on port ${PORT}`);
  console.log(`📁 Data stored at: ${DATA_FILE}`);
});
