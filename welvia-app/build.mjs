import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src.jsx'],bundle:true,minify:true,outfile:'dist/app.js',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'process.env.NODE_ENV':'"production"'}});
for(const f of ['index.html','llms.txt','robots.txt','openapi.json','campaign.js','pitch-template.html'])await copyFile('public/'+f,'dist/'+f);
