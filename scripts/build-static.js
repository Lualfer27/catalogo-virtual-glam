const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "outputs", "catalogo-virtual-glam");
const destination = path.join(root, "dist");

function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name);
    const destinationPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

if (!fs.existsSync(source)) {
  throw new Error(`No se encontro el catalogo en ${source}`);
}

fs.rmSync(destination, { recursive: true, force: true });
copyDirectory(source, destination);

console.log(`Catalogo listo en ${destination}`);
