/**
 * 文件上传中间件（multer）
 * 付款截图 / 送达照片统一存 UPLOAD_DIR（Docker 中挂载 /data/uploads 持久化）
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../data/uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  },
});

/** 图片上传（限 5MB；2 张以内互不冲突） */
const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('file');

module.exports = { uploadImage };
