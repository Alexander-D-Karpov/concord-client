const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const BACKEND_PROTO_PATH = path.join(__dirname, '../../concord/api/proto');
const LOCAL_PROTO_PATH = path.join(__dirname, '../proto');

const PROTO_DIRS = [
    'auth/v1',
    'users/v1',
    'rooms/v1',
    'chat/v1',
    'stream/v1',
    'call/v1',
    'membership/v1',
    'friends/v1',
    'dm/v1',
    'admin/v1',
    'common/v1',
    'registry/v1',
];

const GOOGLE_PROTOS = {
    'google/api/annotations.proto': 'https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/annotations.proto',
    'google/api/http.proto': 'https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/http.proto',
};

const OPENAPI_PROTOS = {
    'protoc-gen-openapiv2/options/annotations.proto': 'https://raw.githubusercontent.com/grpc-ecosystem/grpc-gateway/main/protoc-gen-openapiv2/options/annotations.proto',
    'protoc-gen-openapiv2/options/openapiv2.proto': 'https://raw.githubusercontent.com/grpc-ecosystem/grpc-gateway/main/protoc-gen-openapiv2/options/openapiv2.proto',
};

const PROTOBUF_PROTOS = {
    'google/protobuf/timestamp.proto': 'https://raw.githubusercontent.com/protocolbuffers/protobuf/main/src/google/protobuf/timestamp.proto',
    'google/protobuf/wrappers.proto': 'https://raw.githubusercontent.com/protocolbuffers/protobuf/main/src/google/protobuf/wrappers.proto',
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function copyDir(src, dest) {
    ensureDir(dest);
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

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        ensureDir(path.dirname(dest));

        if (fs.existsSync(dest)) {
            resolve();
            return;
        }

        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(dest);

        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
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

async function main() {
    console.log('Copying proto files from backend...');

    for (const dir of PROTO_DIRS) {
        const srcDir = path.join(BACKEND_PROTO_PATH, dir);
        const destDir = path.join(LOCAL_PROTO_PATH, dir);

        if (fs.existsSync(srcDir)) {
            copyDir(srcDir, destDir);
            console.log(`Copied ${dir}`);
        } else {
            console.warn(`Warning: Source directory not found: ${srcDir}`);
        }
    }

    console.log('Proto files copied successfully!');

    console.log('Ensuring google proto dependencies...');
    for (const [file, url] of Object.entries(GOOGLE_PROTOS)) {
        const dest = path.join(LOCAL_PROTO_PATH, file);
        try {
            await downloadFile(url, dest);
        } catch (err) {
            console.error(`Failed to download ${file}:`, err.message);
        }
    }

    console.log('Ensuring OpenAPI proto dependencies...');
    for (const [file, url] of Object.entries(OPENAPI_PROTOS)) {
        const dest = path.join(LOCAL_PROTO_PATH, file);
        try {
            await downloadFile(url, dest);
        } catch (err) {
            console.error(`Failed to download ${file}:`, err.message);
        }
    }

    console.log('Ensuring google/protobuf dependencies...');
    for (const [file, url] of Object.entries(PROTOBUF_PROTOS)) {
        const dest = path.join(LOCAL_PROTO_PATH, file);
        try {
            await downloadFile(url, dest);
        } catch (err) {
            console.error(`Failed to download ${file}:`, err.message);
        }
    }

    console.log('All proto files ready!');
}

main().catch(console.error);