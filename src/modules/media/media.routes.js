const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
['images', 'videos', 'documents'].forEach(dir => {
  const fullPath = path.join(uploadDir, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'images';
    if (file.mimetype.startsWith('video/')) folder = 'videos';
    else if (file.mimetype === 'application/pdf') folder = 'documents';
    cb(null, path.join(uploadDir, folder));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|avi|pdf|svg|mkv|quicktime/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) cb(null, true);
    else cb(new Error('Unsupported file type'));
  },
});

// POST /media/upload
router.post('/upload', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  console.log('[Media Upload] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[Media Upload] File:', req.file ? 'Received' : 'NOT RECEIVED');
  if (!req.file) {
    console.log('[Media Upload] Body:', JSON.stringify(req.body, null, 2));
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const folder = req.file.destination.split(path.sep).pop();
  const fileUrl = `/uploads/${folder}/${req.file.filename}`;
  res.json({
    success: true,
    data: {
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    }
  });
}));

// POST /media/upload-multiple
router.post('/upload-multiple', authenticate, upload.array('files', 10), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded' });

  const files = req.files.map(file => ({
    url: `/uploads/${file.destination.split('uploads')[1].replace(/\\/g, '/')}/${file.filename}`,
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
  }));

  res.json({ success: true, data: files });
}));

// DELETE /media/:filename
router.delete('/:filename', authenticate, asyncHandler(async (req, res) => {
  // Search in all upload directories
  const dirs = ['images', 'videos', 'documents', 'qrcodes'];
  for (const dir of dirs) {
    const filePath = path.join(uploadDir, dir, req.params.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return res.json({ success: true, message: 'File deleted' });
    }
  }
  res.status(404).json({ success: false, message: 'File not found' });
}));

module.exports = router;
