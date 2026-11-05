const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json({ limit: '15mb' })); 
app.use(cors());
app.use(express.static(__dirname));

// MongoDB Cloud Connection
mongoose.connect('mongodb+srv://shadowanimation13_db_user:Fresh0324kart@cluster0.z3pd69x.mongodb.net/freshkart')
.then(() => {
    console.log('MongoDB Connected Successfully!');
    seedInitialData();
})
.catch(err => console.log(err));

// Render Keep-Alive (14 min ping)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
    setInterval(() => {
        const client = RENDER_URL.startsWith('https') ? https : http;
        client.get(RENDER_URL, (res) => {
            console.log(`Keep-alive ping sent, status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('Keep-alive ping error:', err.message);
        });
    }, 14 * 60 * 1000);
}

// Schemas
const ProductSchema = new mongoose.Schema({
    name: String,
    category: { type: String, default: 'Vegetables' },
    unitType: { type: String, default: 'Weight' },
    basePrice: Number,
    salePrice: Number,
    unit: { type: String, default: '1 kg' },
    inStock: Boolean,
    img: String,
    sortOrder: { type: Number, default: 0 }
});
const Product = mongoose.model('Product', ProductSchema);

const SettingSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    value: mongoose.Schema.Types.Mixed
});
const Setting = mongoose.model('Setting', SettingSchema);

const VisitorSchema = new mongoose.Schema({
    dateKey: { type: String, unique: true },
    count: { type: Number, default: 0 }
});
const Visitor = mongoose.model('Visitor', VisitorSchema);

const CustomerOrderSchema = new mongoose.Schema({
    customerName: String,
    customerPhone: String,
    items: Array,
    totalAmount: Number,
    date: { type: Date, default: Date.now }
});
const CustomerOrder = mongoose.model('CustomerOrder', CustomerOrderSchema);

const UserLogSchema = new mongoose.Schema({
    action: String,
    name: String,
    phone: String,
    timestamp: { type: String, default: () => new Date().toLocaleString() }
});
const UserLog = mongoose.model('UserLog', UserLogSchema);

async function seedInitialData() {
    try {
        const count = await Product.countDocuments();
        if (count === 0) {
            await Product.insertMany([
                { name: 'Fresh Tomato (टमाटर)', category: 'Vegetables', unitType: 'Weight', basePrice: 50, salePrice: 40, unit: '1 kg', inStock: true, img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400', sortOrder: 1 },
                { name: 'Onion (प्याज)', category: 'Vegetables', unitType: 'Weight', basePrice: 45, salePrice: 35, unit: '1 kg', inStock: true, img: 'https://images.unsplash.com/photo-1618512495648-f074b9319e9c?w=400', sortOrder: 2 },
                { name: 'Lemon (नींबू)', category: 'Vegetables', unitType: 'Piece', basePrice: 5, salePrice: 5, unit: '1 Piece', inStock: true, img: 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?w=400', sortOrder: 3 }
            ]);
        }
    } catch (err) { console.log('Seeding error:', err); }
}

// API Routes
app.post('/api/visitor/hit', async (req, res) => {
    try {
        const todayStr = new Date().toISOString().slice(0, 10);
        let visitorDoc = await Visitor.findOne({ dateKey: todayStr });
        if (!visitorDoc) visitorDoc = new Visitor({ dateKey: todayStr, count: 1 });
        else visitorDoc.count += 1;
        await visitorDoc.save();
       
        const allVisitors = await Visitor.find();
        let allDaysMap = {};
        allVisitors.forEach(v => { allDaysMap[v.dateKey] = v.count; });
        const total = allVisitors.reduce((sum, v) => sum + v.count, 0);
        res.json({ success: true, todayCount: visitorDoc.count, totalCount: total, allDays: allDaysMap });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products', async (req, res) => {
    try {
        const { search, category } = req.query;
        let query = {};
        if (category && category !== 'All') query.category = category;
        if (search) query.name = { $regex: search, $options: 'i' };
        res.json(await Product.find(query).sort({ sortOrder: 1 }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/products/:id', async (req, res) => {
    try { res.json({ success: true, updated: await Product.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/products', async (req, res) => {
    try { res.json({ success: true, newProd: await new Product(req.body).save() }); } catch (err) { res.status(500).json({ success: false }); }
});

app.delete('/api/products/:id', async (req, res) => {
    try { await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/settings/:key', async (req, res) => {
    try { const setting = await Setting.findOne({ key: req.params.key }); res.json(setting ? setting.value : null); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings', async (req, res) => {
    try {
        const { key, value } = req.body;
        await Setting.findOneAndUpdate({ key }, { value }, { upsert: true, new: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/orders', async (req, res) => {
    try { res.json(await CustomerOrder.find().sort({ customerName: 1 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/orders', async (req, res) => {
    try { 
        const newOrd = await new CustomerOrder(req.body).save();
        await new UserLog({ action: 'Order Placed', name: req.body.customerName, phone: req.body.customerPhone }).save();
        res.json({ success: true, newOrder: newOrd }); 
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/logs', async (req, res) => {
    try { res.json(await UserLog.find().sort({ _id: -1 }).limit(20)); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/logs', async (req, res) => {
    try { await new UserLog(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});

app.listen(5000, () => { console.log('Server is running on port 5000'); });
