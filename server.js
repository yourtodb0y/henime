const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// FILE DATABASE FISIK JSON
const FILE_DATABASE = './database.json';

// Buat folder uploads jika belum ada
if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

// Fungsi Baca Database Aman
function bacaDatabase() {
    if (!fs.existsSync(FILE_DATABASE)) {
        const dataDefault = [];
        fs.writeFileSync(FILE_DATABASE, JSON.stringify(dataDefault, null, 2));
        return dataDefault;
    }
    try {
        const mentah = fs.readFileSync(FILE_DATABASE, 'utf-8');
        return JSON.parse(mentah);
    } catch (e) {
        return [];
    }
}

// Fungsi Simpan Database
function simpanDatabase(data) {
    fs.writeFileSync(FILE_DATABASE, JSON.stringify(data, null, 2));
}

let daftarKomik = bacaDatabase();

// 1. PASANG SESSION DULUAN (WAJIB PALING ATAS)
app.use(session({
    secret: 'king-komik-super-secret-key-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Batas ukuran upload form ditinggikan biar aman kirim gambar & video
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.json({ limit: '100mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. BARU PASANG OPER DATA ADMIN KE EJS (SETELAH SESSION DIAKTIFKAN)
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

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // Batasan 100MB agar aman untuk video pendek
});

// ================= RUTE UTAMA KOMIK =================
app.get('/', (req, res) => { 
    daftarKomik = bacaDatabase();
    res.render('index', { daftarKomik: daftarKomik }); 
});

// ==================== [SISTEM ROUTE VIDEO / HENTAI] ====================

// 1. HALAMAN UTAMA DAFTAR SEASON VIDEO
app.get('/Hentai', (req, res) => {
    try {
        let dataVideo = [];
        if (fs.existsSync('video.json')) {
            let fileRaw = fs.readFileSync('video.json', 'utf-8');
            dataVideo = JSON.parse(fileRaw || '[]');
        }
        res.render('Hentai', { Hentai: dataVideo });
    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal memuat halaman video, bre!");
    }
});

// 2. TAMPILKAN HALAMAN FORM UPLOAD VIDEO NEW SEASON (Wajib Di atas rute parameter ID)
app.get('/admin/upload-video', cekAdmin, (req, res) => {
    res.render('upload-video');
});

// 3. PROSES SIMPAN DATA VIDEO BARU (SINKRON DESKRIPSI & GENRES ARRAY)
app.post('/admin/upload-video', cekAdmin, upload.fields([
    { name: 'posterFile', maxCount: 1 }, 
    { name: 'videoFile', maxCount: 1 }
]), (req, res) => {
    try {
        if (!req.files || !req.files['posterFile']) {
            return res.send('<script>alert("Aduh bre, file poster/cover belum dipilih!"); window.history.back();</script>');
        }

        const { judul, deskripsi, genres } = req.body;
        const posterPath = '/uploads/' + req.files['posterFile'][0].filename;

        let dataVideo = [];
        if (fs.existsSync('video.json')) {
            dataVideo = JSON.parse(fs.readFileSync('video.json', 'utf8') || '[]');
        }

        // Siapkan array episode bawaan jika admin langsung menyertakan video di form awal
        let initialEpisodes = [];
        if (req.files['videoFile'] && req.files['videoFile'][0]) {
            const videoPath = '/uploads/' + req.files['videoFile'][0].filename;
            initialEpisodes.push({
                idEpisode: "ep-" + Date.now(),
                judulEpisode: "Episode 01",
                urlVideo: videoPath
            });
        }

        // Pecah string genre menjadi array capital otomatis
        let arrayGenre = ["ALL"];
        if (genres && genres.trim() !== "") {
            arrayGenre = genres.split(',').map(g => g.trim().toUpperCase());
        }

        const videoBaru = {
            id: Date.now().toString(),
            judul: judul || "Video Tanpa Judul",
            deskripsi: deskripsi || "Belum ada deskripsi untuk video ini.",
            genres: arrayGenre,
            gambarPreview: posterPath,
            episodes: initialEpisodes,
            updatedOn: 'Hari ini'
        };

        dataVideo.unshift(videoBaru);
        fs.writeFileSync('video.json', JSON.stringify(dataVideo, null, 2), 'utf-8');

        res.send('<script>alert("Season Video Berhasil Dipublikasikan!"); window.location.href="/Hentai";</script>');
    } catch (error) {
        res.send("Gagal Upload Season: " + error.message);
    }
});

// 4. ROUTE DETAIL TAMPILAN SPEK / SEASON VIDEO (Dipaksa kirim objek admin aman)
app.get('/Hentai/detail/:id', (req, res) => {
    try {
        let dataVideo = [];
        if (fs.existsSync('video.json')) {
            let fileRaw = fs.readFileSync('video.json', 'utf-8');
            dataVideo = JSON.parse(fileRaw || '[]');
        }
        
        const video = dataVideo.find(v => v.id == req.params.id);
        if (!video) return res.status(404).send("Season video tidak ditemukan, bre!");
        
        if (!video.episodes) video.episodes = [];
        
        const statusAdminAktif = (req.session && req.session.role === 'admin') ? true : false;
        
        res.render('detail-video', { 
            video: video,
            isAdmin: statusAdminAktif
        });
    } catch (error) {
        res.status(500).send("Gagal menampilkan detail: " + error.message);
    }
});

// 5. [PANEL PINK] PROSES TAMBAH EPISODE BARU KE DALAM SEASON
app.post('/Hentai/:id/tambah-episode', cekAdmin, upload.fields([{ name: 'videoFile', maxCount: 1 }]), (req, res) => {
    try {
        if (!req.files || !req.files['videoFile']) {
            return res.send('<script>alert("File video belum dipilih, bre!"); window.history.back();</script>');
        }

        const idSeason = req.params.id;
        const { judulEpisode } = req.body;
        const videoPath = '/uploads/' + req.files['videoFile'][0].filename;

        let dataVideo = [];
        if (fs.existsSync('video.json')) {
            dataVideo = JSON.parse(fs.readFileSync('video.json', 'utf-8') || '[]');
        }

        const indexSeason = dataVideo.findIndex(v => v.id == idSeason);
        if (indexSeason === -1) return res.send('Season tidak ditemukan!');

        if (!dataVideo[indexSeason].episodes) {
            dataVideo[indexSeason].episodes = [];
        }

        const episodeBaru = {
            idEpisode: "ep-" + Date.now(),
            judulEpisode: "Episode " + (judulEpisode || "Baru"),
            urlVideo: videoPath
        };

        dataVideo[indexSeason].episodes.unshift(episodeBaru);
        fs.writeFileSync('video.json', JSON.stringify(dataVideo, null, 2), 'utf-8');

        res.send('<script>alert("Episode berhasil ditambahkan!"); window.location.href="/Hentai/detail/' + idSeason + '";</script>');
    } catch (error) {
        console.error(error);
        res.send("Gagal menambahkan episode!");
    }
});

// 6. [PANEL MERAH] PROSES HAPUS SATU SEASON TOTAL 
app.post('/Hentai/delete-season/:id', cekAdmin, (req, res) => {
    try {
        const idSeason = req.params.id;
        let dataVideo = [];
        if (fs.existsSync('video.json')) {
            dataVideo = JSON.parse(fs.readFileSync('video.json', 'utf-8') || '[]');
        }

        const season = dataVideo.find(v => v.id == idSeason);
        if (!season) return res.status(404).send('Season tidak ditemukan.');

        if (season.gambarPreview && !season.gambarPreview.includes('default-cover.jpg')) {
            const pathCover = path.join(__dirname, season.gambarPreview);
            if (fs.existsSync(pathCover)) fs.unlinkSync(pathCover);
        }

        if (season.episodes && Array.isArray(season.episodes)) {
            season.episodes.forEach(ep => {
                if (ep.urlVideo) {
                    const pathVideo = path.join(__dirname, ep.urlVideo);
                    if (fs.existsSync(pathVideo)) fs.unlinkSync(pathVideo);
                }
            });
        }

        const dataBaru = dataVideo.filter(v => v.id != idSeason);
        fs.writeFileSync('video.json', JSON.stringify(dataBaru, null, 2), 'utf-8');

        res.send('<script>alert("Season beserta semua video episodenya berhasil dihapus permanen!"); window.location.href="/Hentai";</script>');
    } catch (error) {
        res.status(500).send("Gagal menghapus season: " + error.message);
    }
});

// 7. [PANEL UNGU] HAPUS SATU EPISODE SAJA DI DALAM LIST
app.post('/Hentai/hapus-episode/:idSeason/:idEpisode', cekAdmin, (req, res) => {
    try {
        const { idSeason, idEpisode } = req.params;
        let dataVideo = JSON.parse(fs.readFileSync('video.json', 'utf-8') || '[]');

        const indexSeason = dataVideo.findIndex(v => v.id == idSeason);
        if (indexSeason === -1) return res.status(404).send('Season tidak ditemukan.');

        const season = dataVideo[indexSeason];
        const epIndex = season.episodes.findIndex(e => e.idEpisode === idEpisode);
        if (epIndex === -1) return res.status(404).send('Episode tidak ditemukan.');

        const fileVideoPath = path.join(__dirname, season.episodes[epIndex].urlVideo);
        if (fs.existsSync(fileVideoPath)) {
            fs.unlinkSync(fileVideoPath);
        }

        season.episodes.splice(epIndex, 1);
        fs.writeFileSync('video.json', JSON.stringify(dataVideo, null, 2), 'utf-8');

        res.send('<script>alert("Episode berhasil dihapus!"); window.location.href="/Hentai/detail/' + idSeason + '";</script>');
    } catch (error) {
        res.status(500).send("Gagal menghapus episode.");
    }
});

// 8. ROUTE HALAMAN PLAYER NONTON VIDEO EPISODE
app.get('/Hentai/tonton/:idSeason/:idEpisode', (req, res) => {
    try {
        let dataVideo = JSON.parse(fs.readFileSync('video.json', 'utf-8') || '[]');
        const season = dataVideo.find(v => v.id == req.params.idSeason);
        if (!season) return res.status(404).send("Season tidak ditemukan.");
        
        const episodeAktif = season.episodes.find(e => e.idEpisode === req.params.idEpisode);
        if (!episodeAktif) return res.status(404).send("Episode tidak ditemukan.");

        res.render('tonton-video', { season, episodeAktif });
    } catch (error) {
        res.status(500).send("Error membuka video player.");
    }
});

// ================= RUTE GENRE KOMIK =================
app.get('/genres', (req, res) => {
    try {
        daftarKomik = bacaDatabase(); 
        const genreDipilih = req.query.type ? req.query.type.toUpperCase() : null;

        let daftarGenreUnik = [];
        let hitungGenre = {};

        daftarKomik.forEach(komik => {
            if (!komik.infoDetail) {
                komik.infoDetail = { alternative: "-", status: "Ongoing", type: "Manhwa", released: "2026", author: "King Studio", updatedOn: "Hari ini" };
            }

            if (komik.genre && Array.isArray(komik.genre)) {
                komik.genre.forEach(g => {
                    const namaGenreCapital = g.toUpperCase().trim();
                    
                    if (!daftarGenreUnik.includes(namaGenreCapital)) {
                        daftarGenreUnik.push(namaGenreCapital);
                    }

                    if (!hitungGenre[namaGenreCapital]) {
                        hitungGenre[namaGenreCapital] = 1;
                    } else {
                        hitungGenre[namaGenreCapital]++;
                    }
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
        res.status(500).send("<h1>Gagal Memuat Genre</h1><p>Penyebab: " + error.message + "</p>");
    }
});

// ================= RUTE BACA & MANAGEMENT KOMIK =================
app.get('/baca/:id', (req, res) => {
    daftarKomik = bacaDatabase();
    const komik = daftarKomik.find(k => k.id === req.params.id);
    if (!komik) return res.status(404).send("Komik tidak ditemukan.");
    res.render('baca', { komik: komik });
});

app.get('/komik/:id/baca-chapter/:chId', (req, res) => {
    daftarKomik = bacaDatabase();
    const komik = daftarKomik.find(k => k.id === req.params.id);
    if (!komik) return res.send('Komik tidak ditemukan!');
    const currentChIndex = komik.chapters.findIndex(c => c.idChapter === req.params.chId);
    if (currentChIndex === -1) return res.send('Chapter tidak ditemukan!');
    const chapterAktif = komik.chapters[currentChIndex];
    const nextChapter = currentChIndex > 0 ? komik.chapters[currentChIndex - 1] : null;
    const prevChapter = currentChIndex < komik.chapters.length - 1 ? komik.chapters[currentChIndex + 1] : null;
    res.render('baca-chapter', { komik, chapterAktif, nextChapter, prevChapter });
});

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

app.post('/baca/:id/hapus-komik', cekAdmin, (req, res) => {
    try {
        const idKomik = req.params.id;
        let dataKomik = bacaDatabase();
        const komik = dataKomik.find(k => k.id === idKomik);
        if (!komik) return res.status(404).send('Komik tidak ditemukan.');

        if (komik.cover && !komik.cover.includes('default-cover.jpg')) {
            const pathCover = path.join(__dirname, komik.cover);
            if (fs.existsSync(pathCover)) fs.unlinkSync(pathCover);
        }

        if (komik.chapters && Array.isArray(komik.chapters)) {
            komik.chapters.forEach(ch => {
                if (ch.lembaran && Array.isArray(ch.lembaran)) {
                    ch.lembaran.forEach(gbr => {
                        const pathGambar = path.join(__dirname, gbr);
                        if (fs.existsSync(pathGambar)) fs.unlinkSync(pathGambar);
                    });
                }
            });
        }

        const dataBaru = dataKomik.filter(k => k.id !== idKomik);
        simpanDatabase(dataBaru);
        res.send('<script>alert("Komik dan semua gambarnya berhasil dihapus permanen!"); window.location.href="/";</script>');
    } catch (error) {
        res.status(500).send("Gagal menghapus komik: " + error.message);
    }
});

app.post('/baca/:id/:chId/hapus-chapter', cekAdmin, (req, res) => {
    try {
        const { id, chId } = req.params;
        let dataKomik = bacaDatabase();
        const komikIndex = dataKomik.findIndex(k => k.id === id);
        if (komikIndex === -1) return res.status(404).send('Komik tidak ditemukan.');

        const komik = dataKomik[komikIndex];
        const chapter = komik.chapters.find(c => c.idChapter === chId);
        if (!chapter) return res.status(404).send('Chapter tidak ditemukan.');

        if (chapter.lembaran && Array.isArray(chapter.lembaran)) {
            chapter.lembaran.forEach(gbr => {
                const pathGambar = path.join(__dirname, gbr);
                if (fs.existsSync(pathGambar)) fs.unlinkSync(pathGambar);
            });
        }

        komik.chapters = komik.chapters.filter(c => c.idChapter !== chId);
        simpanDatabase(dataKomik);
        res.send('<script>alert("Chapter berhasil dihapus!"); window.location.href="/baca/' + id + '";</script>');
    } catch (error) {
        res.status(500).send("Gagal menghapus chapter: " + error.message);
    }
});

app.post('/tambah-komik', cekAdmin, upload.fields([
    { name: 'coverKomik', maxCount: 1 },
    { name: 'konten', maxCount: 50 }
]), (req, res) => {
    try {
        const { judul, deskripsi, genre } = req.body;
        let coverPath = '/uploads/default-cover.jpg';
        if (req.files && req.files['coverKomik'] && req.files['coverKomik'][0]) {
            coverPath = `/uploads/${req.files['coverKomik'][0].filename}`;
        }
        let arrayHalaman = [];
        if (req.files && req.files['konten']) {
            arrayHalaman = req.files['konten'].map(file => `/uploads/${file.filename}`);
        }
        const komikBaru = {
            id: Date.now().toString(),
            judul: judul || "Manga Tanpa Judul",
            deskripsi: deskripsi || "Belum ada sinopsis.",
            cover: coverPath,
            genre: genre ? genre.split(',').map(g => g.trim().toUpperCase()) : ["ALL"],
            chapters: arrayHalaman.length > 0 ? [
                {
                    idChapter: "ch-" + Date.now(),
                    judulChapter: "Chapter 01",
                    tanggal: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
                    lembaran: arrayHalaman
                }
            ] : [],
            infoDetail: { alternative: "-", status: "Ongoing", type: "Manhwa", released: "2026", author: "King Studio", updatedOn: "Hari ini" }
        };
        
        daftarKomik = bacaDatabase();
        daftarKomik.unshift(komikBaru);
        simpanDatabase(daftarKomik);
        res.send('<script>alert("Komik Berhasil Dipublish!"); window.location.href="/";</script>');
    } catch (error) {
        res.status(500).send("Gagal upload: " + error.message);
    }
});

// Jalankan Server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server berjalan megah di http://localhost:${PORT}`);
});

server.timeout = 900000;
server.keepAliveTimeout = 900000;

