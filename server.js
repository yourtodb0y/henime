const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { MongoClient } = require('mongodb');

const app = express();

// ==================== KOLEKSI DATABASE CLOUD MONGODB ====================
const urlKoneksi = "mongodb+srv://henime:henime@cluster0.krob7k2.mongodb.net/?appName=Cluster0";
const namaDB = "henimeDB";

let db;
async function konekKeDatabase() {
    if (db) return db;
    try {
        const client = new MongoClient(urlKoneksi);
        await client.connect();
        db = client.db(namaDB);
        console.log("🚀 Sukses Terhubung ke MongoDB Cloud Atlas!");
        return db;
    } catch (e) {
        console.error("❌ Gagal konek ke database cloud:", e);
        return null;
    }
}

// 1. PASANG SESSION DULUAN (WAJIB PALING ATAS)
app.use(session({
    secret: 'king-komik-super-secret-key-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Batas ukuran form ditinggikan biar aman kirim data URL teks panjang
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.json({ limit: '100mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. OPER DATA STATUS ADMIN KE VIEW EJS
app.use((req, res, next) => {
    res.locals.isAdmin = (req.session && req.session.role === 'admin') ? true : false;
    next();
});

function cekAdmin(req, res, next) {
    if (req.session && req.session.role === 'admin') {
        return next();
    } else {
        return res.status(403).send('<script>alert("Akses Ditolak!"); window.location.href="/login";</script>');
    }
}

// Handler file fisik diringankan karena form utama dialihkan ke text URL
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ==================== [SISTEM ROUTE UTAMA KOMIK CLOUD] ====================

// 1. HALAMAN BERANDA UTAMA (LOAD DATA DARI CLOUD)
app.get('/', async (req, res) => {
    try {
        const database = await konekKeDatabase();
        const daftarKomik = await database.collection('komik').find({}).sort({ _id: -1 }).toArray();
        res.render('index', { daftarKomik: daftarKomik });
    } catch (error) {
        console.error("Eror pas buka halaman utama:", error);
        res.status(500).send("Ada masalah pada server backend cloud.");
    }
});

// 2. PROSES TAMBAH DATA KOMIK BARU VIA LINK TEKS (ANTI-EROR READ ONLY)
app.post('/tambah-komik', cekAdmin, async (req, res) => {
    try {
        const { judul, deskripsi, genre, coverKomik, konten } = req.body;
        
        let coverPath = coverKomik || '/uploads/default-cover.jpg';
        let arrayHalaman = [];
        if (konten) {
            arrayHalaman = konten.split(',').map(url => url.trim()).filter(url => url !== "");
        }
        
        // Struktur data asli milikmu (100% AMAN & UTUH)
        const komikBaru = {
            id: Date.now().toString(),
            judul: judul || "Manga Tanpa Judul",
            deskripsi: deskripsi || "Belum ada sinopsis.",
            cover: coverPath,
            genre: genre ? genre.split(',').map(g => g.trim().toUpperCase()) : [],
            chapters: arrayHalaman.length > 0 ? [
                {
                    idChapter: "ch-" + Date.now(),
                    judulChapter: "Chapter 01",
                    tanggal: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
                    lembaran: arrayHalaman
                }
            ] : [],
            infoDetail: { alternative: "-", status: "Ongoing", type: "Manhwa" }
        };

        const database = await konekKeDatabase();
        await database.collection('komik').insertOne(komikBaru);
        
        res.send('<script>alert("Komik Berhasil Dipublish ke Cloud!"); window.location.href="/";</script>');
    } catch (error) {
        res.status(500).send("Gagal upload ke cloud: " + error.message);
    }
});

// 3. ROUTE HALAMAN DETAIL BACA KOMIK
app.get('/baca/:id', async (req, res) => {
    try {
        const database = await konekKeDatabase();
        const komik = await database.collection('komik').findOne({ id: req.params.id });
        if (!komik) return res.status(404).send("Komik tidak ditemukan di cloud.");
        res.render('baca', { komik: komik });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// 4. ROUTE HALAMAN BACA LEMBARAN CHAPTER KOMIK
app.get('/komik/:id/baca-chapter/:chId', async (req, res) => {
    try {
        const database = await konekKeDatabase();
        const komik = await database.collection('komik').findOne({ id: req.params.id });
        if (!komik) return res.send('Komik tidak ditemukan!');
        
        const currentChIndex = komik.chapters.findIndex(c => c.idChapter === req.params.chId);
        if (currentChIndex === -1) return res.send('Chapter tidak ditemukan!');
        
        const chapterAktif = komik.chapters[currentChIndex];
        const nextChapter = currentChIndex > 0 ? komik.chapters[currentChIndex - 1] : null;
        const prevChapter = currentChIndex < komik.chapters.length - 1 ? komik.chapters[currentChIndex + 1] : null;
        
        res.render('baca-chapter', { komik, chapterAktif, nextChapter, prevChapter });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// 5. PROSES HAPUS SATU KOMIK PERMANEN DARI CLOUD
app.post('/baca/:id/hapus-komik', cekAdmin, async (req, res) => {
    try {
        const database = await konekKeDatabase();
        await database.collection('komik').deleteOne({ id: req.params.id });
        res.send('<script>alert("Komik berhasil dihapus dari cloud!"); window.location.href="/";</script>');
    } catch (error) {
        res.status(500).send("Gagal menghapus komik: " + error.message);
    }
});

// 6. PROSES HAPUS SATU CHAPTER SAJA DI DALAM KOMIK
app.post('/baca/:id/:chId/hapus-chapter', cekAdmin, async (req, res) => {
    try {
        const database = await konekKeDatabase();
        const komik = await database.collection('komik').findOne({ id: req.params.id });
        if (!komik) return res.status(404).send('Komik tidak ditemukan.');

        const chaptersBaru = komik.chapters.filter(c => c.idChapter !== req.params.chId);
        await database.collection('komik').updateOne({ id: req.params.id }, { $set: { chapters: chaptersBaru } });
        
        res.send('<script>alert("Chapter berhasil dihapus dari cloud!"); window.location.href="/baca/' + req.params.id + '";</script>');
    } catch (error) {
        res.status(500).send("Gagal menghapus chapter: " + error.message);
    }
});

// ==================== [SISTEM ROUTE VIDEO / HENTAI CLOUD] ====================

// 1. HALAMAN DAFTAR UTAMA VIDEO (LOAD CLOUD)
app.get('/Hentai', async (req, res) => {
    try {
        const database = await konekKeDatabase();
        const dataVideo = await database.collection('video').find({}).sort({ _id: -1 }).toArray();
        res.render('Hentai', { Hentai: dataVideo });
    } catch (error) {
        res.status(500).send("Gagal memuat halaman video cloud, bre!");
    }
});

// 2. FORM UPLOAD NEW SEASON VIDEO
app.get('/admin/upload-video', cekAdmin, (req, res) => { res.render('upload-video'); });

// 3. PROSES SIMPAN DATA SEASON VIDEO BARU
app.post('/admin/upload-video', cekAdmin, upload.fields([
    { name: 'posterFile', maxCount: 1 }, 
    { name: 'videoFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const { judul, deskripsi, genres } = req.body;
        let posterPath = '/uploads/default-cover.jpg';
        if (req.files && req.files['posterFile']) {
            posterPath = '/uploads/' + req.files['posterFile'][0].filename;
        }

        let initialEpisodes = [];
        if (req.files && req.files['videoFile'] && req.files['videoFile'][0]) {
            initialEpisodes.push({
                idEpisode: "ep-" + Date.now(),
                judulEpisode: "Episode 01",
                urlVideo: '/uploads/' + req.files['videoFile'][0].filename
            });
        }

        let arrayGenre = ["ALL"];
        if (genres && genres.trim() !== "") {
            arrayGenre = genres.split(',').map(g => g.trim().toUpperCase());
        }

        const videoBaru = {
            id: Date.now().toString(),
            judul: judul || "Video Tan Tanpa Judul",
            deskripsi: deskripsi || "Belum ada deskripsi untuk video ini.",
            genres: arrayGenre,
            gambarPreview: posterPath,
            episodes: initialEpisodes,
            updatedOn: 'Hari ini'
        };

        const database = await konekKeDatabase();
        await database.collection('video').insertOne(videoBaru);

        res.send('<script>alert("Season Video Berhasil Dipublikasikan ke Cloud!"); window.location.href="/Hentai";</script>');
    } catch (error) {
        res.send("Gagal Upload Season: " + error.message);
    }
});

// 4. ROUTE DETAIL TAMPILAN VIDEO SEASON
app.get('/Hentai/detail/:id', async (req, res) => {
    try {
        const database = await konekKeDatabase();
        const video = await database.collection('video').findOne({ id: req.params.id });
        if (!video) return res.status(404).send("Season video tidak ditemukan.");
        
        if (!video.episodes) video.episodes = [];
        const statusAdminAktif = (req.session && req.session.role === 'admin') ? true : false;
        
        res.render('detail-video', { video: video, isAdmin: statusAdminAktif });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// 5. PROSES TAMBAH EPISODE BARU KE SEASON
app.post('/Hentai/:id/tambah-episode', cekAdmin, upload.fields([{ name: 'videoFile', maxCount: 1 }]), async (req, res) => {
    try {
        if (!req.files || !req.files['videoFile']) {
            return res.send('<script>alert("File video belum dipilih, bre!"); window.history.back();</script>');
        }
        const { judulEpisode } = req.body;
        const videoPath = '/uploads/' + req.files['videoFile'][0].filename;

        const database = await konekKeDatabase();
        const video = await database.collection('video').findOne({ id: req.params.id });
        if (!video) return res.send('Season tidak ditemukan!');

        let episodes = video.episodes || [];
        episodes.unshift({
            idEpisode: "ep-" + Date.now(),
            judulEpisode: "Episode " + (judulEpisode || "Baru"),
            urlVideo: videoPath
        });

        await database.collection('video').updateOne({ id: req.params.id }, { $set: { episodes: episodes } });
        res.send('<script>alert("Episode berhasil ditambahkan!"); window.location.href="/Hentai/detail/' + req.params.id + '";</script>');
    } catch (error) {
        res.send("Gagal menambahkan episode!");
    }
});

// 6. HAPUS TOTAL SATU SEASON VIDEO
app.post('/Hentai/delete-season/:id', cekAdmin, async (req, res) => {
    try {
        const database = await konekKeDatabase();
        await database.collection('video').deleteOne({ id: req.params.id });
        res.send('<script>alert("Season berhasil didelete dari cloud!"); window.location.href="/Hentai";</script>');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// 7. HAPUS SATU EPISODE SAJA DI SATU SEASON
app.post('/Hentai/hapus-episode/:idSeason/:idEpisode', cekAdmin, async (req, res) => {
    try {
        const database = await konekKeDatabase();
        const video = await database.collection('video').findOne({ id: req.params.idSeason });
        if (!video) return res.status(404).send('Season tidak ditemukan.');

        const episodesBaru = video.episodes.filter(e => e.idEpisode !== req.params.idEpisode);
        await database.collection('video').updateOne({ id: req.params.idSeason }, { $set: { episodes: episodesBaru } });
        
        res.send('<script>alert("Episode berhasil terhapus!"); window.location.href="/Hentai/detail/' + req.params.idSeason + '";</script>');
    } catch (error) {
        res.status(500).send("Gagal menghapus episode.");
    }
});

// 8. PLAYER NONTON VIDEO EPISODE
app.get('/Hentai/tonton/:idSeason/:idEpisode', async (req, res) => {
    try {
        const database = await konekKeDatabase();
        const season = await database.collection('video').findOne({ id: req.params.idSeason });
        if (!season) return res.status(404).send("Season tidak ditemukan.");
        
        const episodeAktif = season.episodes.find(e => e.idEpisode === req.params.idEpisode);
        if (!episodeAktif) return res.status(404).send("Episode tidak ditemukan.");

        res.render('tonton-video', { season, episodeAktif });
    } catch (error) {
        res.status(500).send("Error membuka video player.");
    }
});

// ==================== [SISTEM FILTER GENRE KOMIK CLOUD] ====================
app.get('/genres', async (req, res) => {
    try {
        const database = await konekKeDatabase();
        const daftarKomik = await database.collection('komik').find({}).toArray();
        const genreDipilih = req.query.type ? req.query.type.toUpperCase() : null;

        let daftarGenreUnik = [];
        let hitungGenre = {};

        daftarKomik.forEach(komik => {
            if (!komik.infoDetail) {
                komik.infoDetail = { alternative: "-", status: "Ongoing", type: "Manhwa" };
            }
            if (komik.genre && Array.isArray(komik.genre)) {
                komik.genre.forEach(g => {
                    const namaGenreCapital = g.toUpperCase().trim();
                    if (!daftarGenreUnik.includes(namaGenreCapital)) {
                        daftarGenreUnik.push(namaGenreCapital);
                    }
                    hitungGenre[namaGenreCapital] = (hitungGenre[namaGenreCapital] || 0) + 1;
                });
            }
        });

        daftarGenreUnik.sort();
        let komikTerfilter = [];
        if (genreDipilih) {
            komikTerfilter = daftarKomik.filter(komik => 
                komik.genre && komik.genre.map(g => g.toUpperCase().trim()).includes(genreDipilih)
            );
        }

        res.render('genres', { 
            daftarGenreUnik: daftarGenreUnik, 
            hitungGenre: hitungGenre,
            genreDipilih: genreDipilih, 
            komikTerfilter: komikTerfilter, 
            daftarKomik: daftarKomik
        });
    } catch (error) {
        res.status(500).send("<p>Penyebab Gagal Genre: " + error.message + "</p>");
    }
});

// SYSTEM AUTH LOGIN BYPASSER
app.get('/login', (req, res) => { res.render('login'); });
app.get('/admin', cekAdmin, (req, res) => { res.render('admin'); });

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'rahasia123') {
        req.session.role = 'admin';
        return res.send('<script>alert("Login Sukses, Halo Admin!"); window.location.href="/";</script>');
    }
    res.status(401).send('<script>alert("Salah!"); window.history.back();</script>');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// RUNNER LOCALHOST HANYA UNTUK DEVELOPMENT DI TERMUX
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server berjalan megah di http://localhost:${PORT}`);
    });
}

// EKSPOR UTAMA UNTUK VERCEL SERVERLESS RUNTIME
module.exports = app;

