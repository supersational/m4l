import {format} from './state.js';
export const C={bg:'#363636',black:'#181818',ink:'var(--ink,#b5b5b5)',muted:'var(--muted,#858585)',cyan:'var(--cyan,#03c3d5)',orange:'var(--orange,#ffad56)',header:'#b0ddeb'};
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const text=(x,y,s,color=C.ink,size=11.5,anchor='start')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}">${esc(s)}</text>`;
export const rect=(x,y,w,h,fill,stroke='none',sw=1,rx=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
export const line=(x,y,x2,y2,color='#252525',w=1)=>`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"/>`;
export const hit=(p,body,role='slider',extra='')=>`<g data-param="${esc(p.name)}" role="${role}" tabindex="0" aria-label="${esc(p.name)}" ${role==='slider'?`aria-valuemin="${p.min}" aria-valuemax="${p.max}" aria-valuenow="${p.value}" aria-valuetext="${esc(format(p))}"`:role==='button'?`aria-pressed="${p.value>0}"`:''} ${extra}>${body}<title>${esc(p.name)}: ${esc(format(p))}</title></g>`;
export function read(p,x,y,w=45,color=C.cyan,anchor='start') {return hit(p,rect(anchor==='middle'?x-w/2:x,y-12,w,17,'transparent')+text(x,y,format(p),color,11.5,anchor))}
export function toggle(p,x,y,w,h,label,color=C.orange,selected=!!p.value){return hit(p,rect(x,y,w,h,selected?color:'#242424','#161616',1.2)+text(x+w/2,y+h/2+3.7,label,selected?'#101010':C.ink,11.5,'middle'),'button')}
export function box(p,x,y,color=C.cyan){return hit(p,rect(x,y,9,9,p.value?color:'none',color,1),'button')}
export function choice(p,x,y,w,h=13){return hit(p,rect(x,y,w,h,'#242424','#161616',1.2)+text(x+2,y+h-3,format(p))+`<path d="M${x+w-9} ${y+4}h7l-3.5 5Z" fill="${C.ink}"/>`,'combobox')}
function point(cx,cy,r,a){return [cx+r*Math.cos(a*Math.PI/180),cy+r*Math.sin(a*Math.PI/180)]}
export function arc(cx,cy,r,a,b){let p=point(cx,cy,r,a),q=point(cx,cy,r,b);return `M${p[0]} ${p[1]}A${r} ${r} 0 ${b-a>180?1:0} 1 ${q[0]} ${q[1]}`}
export function knob(p,x,y,label,display){
 let f=(p.value-p.min)/(p.max-p.min),a=120+300*f,cx=x+20,cy=y+25;
 let hand=point(cx,cy,12,a);
 return hit(p,rect(x-10,y-3,60,55,'transparent')+text(cx,y+7,label,C.ink,11.5,'middle')+`<path d="${arc(cx,cy,13,120,420)}" fill="none" stroke="#171717" stroke-width="2.3"/><path d="${arc(cx,cy,13,120,Math.max(120.01,a))}" fill="none" stroke="${C.cyan}" stroke-width="2.3"/><path d="M${cx} ${cy}L${hand[0]} ${hand[1]}" stroke="#191919" stroke-width="2.5" stroke-linecap="round"/>`+text(cx,y+48,display??format(p),C.ink,11.5,'middle'));
}
