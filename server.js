const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Kết nối MongoDB (dùng MongoDB Atlas)
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://admin:yourpassword@cluster0.xxxxx.mongodb.net/demngayyeu?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Cấu hình Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Schema và Model
const ContentSchema = new mongoose.Schema({
    names: { type: [String], required: true, default: ['Thế Vũ', 'Thu Giang'] },
    description: { type: String, default: 'Hành trình yêu thương của chúng mình bắt đầu từ' },
    startDate: { type: Date, default: new Date('2025-04-25T22:50:00') },
    favicon: { type: String, default: '/uploads/default-favicon.ico' },
    avatars: { type: [String], default: ['https://via.placeholder.com/120', 'https://via.placeholder.com/120'] },
    album: [{ url: String, description: String }],
});
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const Content = mongoose.model('Content', ContentSchema);
const User = mongoose.model('User', UserSchema);

// Tạo thư mục uploads
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Middleware xác thực JWT
const authenticateJWT = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// API: Đăng nhập
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// API: Lấy nội dung
app.get('/api/content', async (req, res) => {
    try {
        let content = await Content.findOne();
        if (!content) {
            content = new Content();
            await content.save();
        }
        res.json(content);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Cập nhật nội dung (bảo mật)
app.put('/api/content', authenticateJWT, async (req, res) => {
    try {
        const { names, description, startDate } = req.body;
        const content = await Content.findOne();
        if (content) {
            content.names = names || content.names;
            content.description = description || content.description;
            content.startDate = startDate ? new Date(startDate) : content.startDate;
            await content.save();
            res.json(content);
        } else {
            res.status(404).json({ error: 'Content not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Cập nhật favicon
app.post('/api/favicon', authenticateJWT, upload.single('favicon'), async (req, res) => {
    try {
        const content = await Content.findOne();
        if (content && req.file) {
            content.favicon = `/uploads/${req.file.filename}`;
            await content.save();
            res.json(content);
        } else {
            res.status(400).json({ error: 'No file uploaded or content not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Cập nhật ảnh đại diện
app.post('/api/avatars', authenticateJWT, upload.array('avatars', 2), async (req, res) => {
    try {
        const content = await Content.findOne();
        if (content && req.files) {
            const avatarUrls = req.files.map(file => `/uploads/${file.filename}`);
            content.avatars = avatarUrls.length === 2 ? avatarUrls : content.avatars;
            await content.save();
            res.json(content);
        } else {
            res.status(400).json({ error: 'No files uploaded or content not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Thêm ảnh album
app.post('/api/album', authenticateJWT, upload.single('image'), async (req, res) => {
    try {
        const { description } = req.body;
        const content = await Content.findOne();
        if (content && req.file) {
            content.album.push({ url: `/uploads/${req.file.filename}`, description });
            await content.save();
            res.json(content);
        } else {
            res.status(400).json({ error: 'No file uploaded or content not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Xóa ảnh album
app.delete('/api/album/:index', authenticateJWT, async (req, res) => {
    try {
        const index = req.params.index;
        const content = await Content.findOne();
        if (content && content.album[index]) {
            content.album.splice(index, 1);
            await content.save();
            res.json(content);
        } else {
            res.status(404).json({ error: 'Image not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Sửa mô tả ảnh album
app.put('/api/album/:index', authenticateJWT, async (req, res) => {
    try {
        const index = req.params.index;
        const { description } = req.body;
        const content = await Content.findOne();
        if (content && content.album[index]) {
            content.album[index].description = description;
            await content.save();
            res.json(content);
        } else {
            res.status(404).json({ error: 'Image not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Phục vụ giao diện quản trị
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Phục vụ frontend
app.use(express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
