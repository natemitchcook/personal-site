import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdir,copyFile,readFile,writeFile,rm,cp} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
const result=await build({entryPoints:['src.jsx'],bundle:true,minify:true,outdir:'dist',entryNames:'app-[hash]',metafile:true,loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'process.env.NODE_ENV':'"production"'}});
await cp('public','dist',{recursive:true});
const js=Object.keys(result.metafile.outputs).find(f=>f.endsWith('.js'));
const css=Object.keys(result.metafile.outputs).find(f=>f.endsWith('.css'));
if(!js||!css)throw new Error('Missing application assets');
let html=await readFile('dist/index.html','utf8');
html=html.replace('/app.js','/'+js.replace(/^dist\//,'')).replace('/app.css','/'+css.replace(/^dist\//,''));
await writeFile('dist/index.html',html);
// Compatibility for older cached shells while the updated HTML reaches browsers.
await copyFile(js,'dist/app.js');
await copyFile(css,'dist/app.css');

execFileSync('python3',['scripts/build_editorial.py'],{stdio:'inherit'});
execFileSync('python3',['scripts/check_editorial.py'],{stdio:'inherit'});
// S3 REST origins do not resolve extensionless routes to index.html.
// Publish the same authenticated business shell at the canonical route.
await copyFile('dist/index.html','dist/business');

// Public synthetic demonstration only. No owner data or authentication state.
await mkdir('dist/care-demo',{recursive:true});
await copyFile('care/demo/index.html','dist/care-demo/index.html');
