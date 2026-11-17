// Only QR modules need custom drawing; labels, link and buttons are native Max UI.
autowatch=1;inlets=1;outlets=0;
mgraphics.init();mgraphics.relative_coords=0;mgraphics.autofill=0;
var matrix=null;
function qr(v){try{matrix=JSON.parse(v);}catch(e){matrix=null;}mgraphics.redraw();}
function paint(){
    mgraphics.set_source_rgba(1,1,1,1);mgraphics.rectangle(0,0,120,120);mgraphics.fill();
    if(!matrix)return;
    var unit=120/(matrix.size+8),offset=4*unit;
    mgraphics.set_source_rgba(.06,.10,.10,1);
    for(var i=0;i<matrix.size;i++)for(var j=0;j<matrix.size;j++)if(matrix.data[i*matrix.size+j]){
        mgraphics.rectangle(offset+j*unit,offset+i*unit,unit+.1,unit+.1);mgraphics.fill();
    }
}
