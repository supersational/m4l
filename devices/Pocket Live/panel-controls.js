// Native presentation controls; the QR is the only custom-drawn element.
autowatch=0;inlets=1;outlets=0;
var current=0,lan=1,CREAM=[.94,.93,.89,1],WARM=[.94,.925,.895,1],INK=[.10,.17,.18,1],TEAL=[0,.47,.39,1],ORANGE=[.68,.38,.13,1],PALE=[.83,.85,.79,1];
function named(name){try{return this.patcher.getnamed(name);}catch(e){return null;}}
function message(name){var obj=named(name);if(obj){var args=arrayfromargs(arguments).slice(1),flat=[];for(var i=0;i<args.length;i++)flat=flat.concat(args[i]);obj.message.apply(obj,flat);}}
function hidden(name,value){var obj=named(name);if(obj)obj.hidden=value;}
function panelmode(value){current=Number(value);var bg=current?WARM:CREAM,accent=current?ORANGE:TEAL;
 message('background','bgcolor',bg);message('url','bgcolor',bg);message('url','bordercolor',bg);message('url','textcolor',accent);message('open','bgcolor',accent);message('open','activebgcolor',accent);
 for(var i=0;i<2;i++){var color=i===current?accent:PALE,ink=i===current?CREAM:INK;message(i?'tab_local':'tab_cloud','bgcolor',color);message(i?'tab_local':'tab_cloud','activebgcolor',color);message(i?'tab_local':'tab_cloud','textcolor',ink);}
 hidden('scope_mac',1);hidden('scope_lan',1);hidden('port',1);hidden('port_label',1);hidden('auto_port',!current);hidden('auto_port_help',!current);
 message('headline','set',current?'Your set. Right here.':'Your set. On your phone.');message('subtitle','set',current?'Open here, or scan on the same Wi-Fi.':'Scan the private QR code to connect.');message('footer','set',current?'Local control · same Wi-Fi · no internet required.':'Anyone with this private link can control this set.');panelscope(lan);
}
function panelscope(value){lan=Number(value);if(current)message('subtitle','set',lan?'Open here, or scan on the same Wi-Fi.':'Open this controller on the same Mac.');for(var i=0;i<2;i++){message(i?'scope_lan':'scope_mac','bgcolor',i===lan?[.85,.77,.65,1]:PALE);}}
function connection(local,ready){message('dot','textcolor',ready?(Number(local)?[0,.47,.39,1]:[.75,.43,.14,1]):[.55,.55,.51,1]);}
