const {ROOT}=require('../../harness/paths.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={};vm.createContext(c);for(const n of ['device-ui','echo-renderer','echo-signature','echo-profile'])vm.runInContext(fs.readFileSync(ROOT+'/web/'+n+'.js','utf8'),c);vm.runInContext('globalThis.profile=EchoProfile;globalThis.render=EchoRenderer.render;globalThis.signature=EchoSignature;',c);
const d={id:17,name:'My Echo',className:'Echo',parameters:JSON.parse(JSON.stringify(c.signature.bindings)).map((p,i)=>({...p,id:100+i,value:p.min,display:'0',enabled:true,defaultValue:p.quantized?null:p.min}))};
assert.ok(c.profile.matches(d,'Echo'));assert.equal(c.profile.matches(d,'Eq8'),false);assert.equal(c.profile.matches({...d,parameters:d.parameters.slice(1)},'Echo'),false);
const changed=structuredClone(d);changed.parameters.find(p=>p.name==='Mod Wave').items.reverse();assert.equal(c.profile.matches(changed,'Echo'),false);
const by=n=>d.parameters.find(p=>p.name===n);by('Link').value=1;
assert.deepEqual(Array.from(c.profile.change(d,'L Synced',-2.3),p=>p.name),['L Synced','R Synced']);assert.equal(c.profile.change(d,'L Synced',-2.3)[0].value,-2);
assert.deepEqual(Array.from(c.profile.change(d,'L Offset',.8),p=>p.name),['L Offset']);assert.equal(c.profile.change(d,'Feedback',100)[0].value,by('Feedback').max);
by('Feedback').enabled=false;assert.equal(c.profile.change(d,'Feedback',.5).length,0);
const p=Object.fromEntries(d.parameters.map(q=>[q.name,{...q,initial:q.value,initialDisplay:q.display}]));for(const page of ['Echo','Modulation','Character']){const svg=c.render(p,page,{full:true,tempo:90});assert.ok(svg.includes('<svg'));assert.ok(!/NaN|Infinity/.test(svg),page);}
console.log('Echo integration passed: strict contract/fallback, live IDs, linked timing with independent offsets, discrete rates, clamp/disabled controls, three-page rendering.');
