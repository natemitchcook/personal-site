import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
const result=await build({entryPoints:['src.jsx'],bundle:true,minify:true,outdir:'dist',entryNames:'app-[hash]',metafile:true,loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'process.env.NODE_ENV':'"production"'}});
for(const f of ['index.html','llms.txt','robots.txt','openapi.json','campaign.js','pitch-template.html'])await copyFile('public/'+f,'dist/'+f);
const js=Object.keys(result.metafile.outputs).find(f=>f.endsWith('.js'));
const css=Object.keys(result.metafile.outputs).find(f=>f.endsWith('.css'));
if(!js||!css)throw new Error('Missing application assets');
let html=await readFile('dist/index.html','utf8');
html=html.replace('/app.js','/'+js.replace(/^dist\//,'')).replace('/app.css','/'+css.replace(/^dist\//,''));
await writeFile('dist/index.html',html);
// Compatibility for older cached shells while the updated HTML reaches browsers.
await copyFile(js,'dist/app.js');
await copyFile(css,'dist/app.css');
