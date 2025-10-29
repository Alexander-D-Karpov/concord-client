const fs = require('fs');
const path = require('path');

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

console.log('Copying proto files...');
copyDir(protoSrc, protoDest);
console.log('Proto files copied successfully!');