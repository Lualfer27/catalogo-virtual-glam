# Catalogo Virtual Glam

Catalogo digital interactivo para Glam by Adriana Montoya. El proyecto queda preparado para subirse a GitHub y despues publicarse en Vercel o Hostinger.

## Contenido del proyecto

- `outputs/catalogo-virtual-glam/`: version principal del catalogo digital.
- `outputs/catalogo-virtual-glam/assets/`: imagenes y recursos visuales.
- `outputs/catalogo-virtual-glam/products.json`: datos base de los articulos.
- `scripts/build-static.js`: prepara la carpeta publicable.
- `scripts/serve-static.js`: permite probar la version preparada.
- `dist/`: carpeta generada para publicar. No se guarda en GitHub porque se puede regenerar.

## Probar en el computador

1. Instalar Node.js si el equipo no lo tiene.
2. Abrir una terminal en esta carpeta.
3. Ejecutar:

```bash
npm run build
npm start
```

Si PowerShell bloquea `npm`, usar:

```bash
npm.cmd run build
npm.cmd start
```

4. Abrir:

```text
http://127.0.0.1:8765
```

## Subir a GitHub

1. Crear un repositorio nuevo en GitHub.
2. En esta carpeta, guardar los cambios con Git.
3. Conectar este proyecto con el repositorio de GitHub.
4. Subir la rama principal.

Comandos sugeridos desde una terminal normal:

```bash
git init
git add .
git commit -m "Preparar catalogo virtual Glam"
git branch -M main
git remote add origin URL_DEL_REPOSITORIO
git push -u origin main
```

Tambien se puede hacer con GitHub Desktop: agregar esta carpeta como repositorio local, crear el commit y publicarlo.

Antes de subir, revisar que no se publiquen claves privadas. La clave de Supabase usada por el catalogo debe ser una clave publica o anonima.

## Publicar en Vercel

Vercel puede tomar este repositorio directamente desde GitHub.

- Framework preset: `Other`
- Build command: `npm run build`
- Output directory: `dist`

El archivo `vercel.json` ya deja configurados esos valores.

## Publicar en Hostinger

Para Hostinger se recomienda:

1. Ejecutar:

```bash
npm run build
```

2. Subir el contenido de la carpeta `dist/` al directorio publico del hosting, normalmente `public_html`.

No se debe subir la carpeta `dist` completa como subcarpeta, sino sus archivos internos para que `index.html` quede en la raiz publica.

## Supabase

El catalogo ya esta preparado para leer y guardar informacion usando Supabase desde el navegador. Para produccion, conviene revisar:

- Que las tablas tengan politicas RLS correctas.
- Que las imagenes nuevas se guarden en un bucket publico o con URLs firmadas.
- Que solo usuarios autorizados puedan crear, editar o eliminar articulos y categorias.
