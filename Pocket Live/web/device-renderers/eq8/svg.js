// Optional drawing primitives; styles/geometry must be calibrated to EQ Eight.
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const text=(x,y,value,fill='#b5b5b5',size=11.5,anchor='start')=>`<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" text-anchor="${anchor}">${esc(value)}</text>`;
export const rect=(x,y,width,height,fill,stroke='none',radius=0)=>`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" rx="${radius}"/>`;
export const line=(x1,y1,x2,y2,stroke='#858585',width=1)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
export function slider(parameter,content,display=String(parameter.value)){
 return `<g tabindex="${parameter.enabled===false?-1:0}" role="slider" data-param="${esc(parameter.name)}" aria-label="${esc(parameter.name)}" aria-disabled="${parameter.enabled===false}" aria-valuemin="${parameter.min}" aria-valuemax="${parameter.max}" aria-valuenow="${parameter.value}" aria-valuetext="${esc(display)}">${content}</g>`;
}
