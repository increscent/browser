const http = require('http');
const fs = require('fs');
const path = require('path');
const uuid = require('./packages/uuid.js');
const mustache = require('./packages/mustache.js');
const mime = require('./packages/mime.js');

const hostname = '127.0.0.1';
const port = 8462;
const root = '/home/robert/notes/';

const GET = (req, res) => {
    let stats = statFile(req.filepath);

    if (stats.exists && stats.isDirectory) {
        files = fs.readdirSync(req.filepath).map(file => ({
            name: file,
            path: req.path ? (`/${req.path}/${file}`) : (`/${file}`),
        }));

        let data = {
            files,
            hasUpperPath: req.path !== '',
            upperPath: '/' + req.path.split('/').slice(0, -1).join('/'),
        };

        let response = mustache.render(fs.readFileSync('./dir.html').toString(), data);
        res.send(response, 200, 'text/html');
    }
    else if (stats.exists && stats.isFile) {
        let ext = path.extname(req.filepath);
        let contentType = mime[ext] || 'application/octet';

        if (/^text\/.*/.test(contentType)) {
            let response = mustache.render(fs.readFileSync('./file.html').toString(), {
                folder: '/' + req.path.split('/').slice(0, -1).join('/'),
                path: '/' + req.path,
                text: fs.readFileSync(req.filepath).toString(),
                contentType,
            });
            res.send(response, 200, 'text/html');
        }
        else {
            serveStatic(res, req.filepath);
        }
    }
    else {
        return res.notFound();
    }
};

const POST = (req, res) => {
    let stats = statFile(req.filepath);

    if (stats.exists && stats.isDirectory) {
        res.send('Bad Request', 400);
    }
    else {
        let dirpath = root + req.path.split('/').slice(0, -1).join('/');
        if (!fs.existsSync(dirpath)) {
            fs.mkdirSync(dirpath, {recursive: true});
        }
        fs.writeFileSync(req.filepath, req.body);
        res.send('OK');
    }
};

const statFile = (filepath) => {
    try {
        let stats = fs.statSync(filepath);

        return {
            exists: true,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
        };
    } catch (e) {
        return {
            exists: false,
        };
    }
};

const getQuery = (queryStr) => {
    let query = {};
    if (queryStr) queryStr
        .split('&')
        .map(x => x.split('='))
        .map(x => x.map(y => (decodeURIComponent(y) || '').replace(/\+/g, ' ')))
        .map(([x, y]) => query[x] = y);

    return query;
};

const getPath = (url) => {
    return (url || '')
        .replace(/\.\./g, '')
        .split('/')
        .filter(x => x)
        .join('/');
};

const server = http.createServer((req, res) => {
    let [url, queryStr] = req.url.split('?', 2);
    req.query = getQuery(queryStr);
    req.path = getPath(url);
    req.filepath = root + req.path;

    res.send = (data, statusCode, contentType) => {
        res.statusCode = statusCode || 200;
        res.setHeader('Content-Type', contentType || 'text/plain');
        res.end(data);
    };

    res.notFound = () => {
        res.send('Not Found', 404);
    };

    getBody(req, (body) => {
        req.body = body;
        try {
            switch (req.method) {
                case 'GET':
                    return GET(req, res);
                case 'POST':
                    return POST(req, res);
                default:
                    res.send('Method Not Allowed', 405);
            }
        } catch (e) {
            console.log(e);
            res.send('Internal Server Error', 500);
        }
    });
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}`);
});

function getBody(req, callback) {
    let body = [];
    req.on('data', (chunk) => body.push(chunk));
    req.on('end', () => callback(Buffer.concat(body)));
}

function serveStatic(res, filename, statusCode) {
    fs.readFile(filename, (err, data) => {
        if (err) return notFound(res);

        let ext = path.extname(filename);
        let contentType = mime[ext] || 'application/octet';

        return res.send(data, statusCode || 200, contentType);
    });
}
