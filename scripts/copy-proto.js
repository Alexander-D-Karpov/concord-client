const fs = require('fs');
const path = require('path');
const https = require('https');

const protoSrc = path.join(__dirname, '../../concord/api/proto');
const protoDest = path.join(__dirname, '../proto');

function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                download(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function ensureGoogleProtos() {
    const googleProtos = [
        {
            url: 'https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/annotations.proto',
            dest: path.join(protoDest, 'google/api/annotations.proto')
        },
        {
            url: 'https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/http.proto',
            dest: path.join(protoDest, 'google/api/http.proto')
        },
        {
            url: 'https://raw.githubusercontent.com/protocolbuffers/protobuf/main/src/google/protobuf/timestamp.proto',
            dest: path.join(protoDest, 'google/protobuf/timestamp.proto')
        },
        {
            url: 'https://raw.githubusercontent.com/protocolbuffers/protobuf/main/src/google/protobuf/wrappers.proto',
            dest: path.join(protoDest, 'google/protobuf/wrappers.proto')
        }
    ];

    for (const proto of googleProtos) {
        if (!fs.existsSync(proto.dest)) {
            console.log(`Downloading ${path.basename(proto.dest)}...`);
            await download(proto.url, proto.dest);
        }
    }
}

async function main() {
    console.log('Copying proto files from backend...');
    copyDir(protoSrc, protoDest);
    console.log('Proto files copied successfully!');

    console.log('Ensuring google proto dependencies...');
    await ensureGoogleProtos();
    console.log('All proto files ready!');
}

main().catch(console.error);