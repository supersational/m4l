"""Build the native 169px device; --portable uses adjacent packaged support files."""
import argparse,json
from pathlib import Path
from tools.patch_writer import Patch

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--portable',action='store_true',help='Use relative references to adjacent support files')
parser.add_argument('--output',type=Path)
parser.add_argument('--resource-root',type=Path,help='Use supporting files from an isolated QA runtime')
args=parser.parse_args()
if args.portable and args.resource_root:
    parser.error('--portable and --resource-root are mutually exclusive')
def resource(name):
    return name if args.portable else str((args.resource_root or HERE).resolve()/name)
def object_path(name):
    value=resource(name)
    return json.dumps(value,ensure_ascii=False) if any(ch.isspace() for ch in value) else value
p=Patch();inp=p.box('plugin~');out=p.box('plugout~');p.wire(inp,out);p.wire(inp,out,1,1)
def codebox(kind, source, outputs, **attributes):
    key = p.box('', kind)
    box = p.boxes[-1]['box']
    box.pop('text')
    box.update(code=(HERE/'tools'/source).read_text(), numinlets=1, numoutlets=outputs,
               outlettype=['']*outputs, saved_object_attributes=attributes)
    return key

if args.portable:
    node = codebox('node.codebox', 'node_startup.js', 2, autostart=0, watch=0)
else:
    node = p.box('node.script '+object_path('maxnode/bridge.js')+' @autostart 0 @watch 0')
startup = codebox('v8.codebox', 'max_startup.js', 1, parameter_enable=0)
live=p.box('js '+object_path('live.js'));ui=p.box('js '+object_path('panel-controls.js'))
CREAM=[.94,.93,.89,1.];INK=[.10,.17,.18,1.];MUTED=[.43,.49,.47,1.];GREEN=[0.,.47,.39,1.];PALE=[.83,.85,.79,1.]
def control(kind,rect,name=None,**attrs):
 key=p.box('',kind);p.boxes[-1]['box'].update(presentation=1,presentation_rect=rect,patching_rect=rect,**attrs)
 if name:p.boxes[-1]['box']['varname']=name
 return key
def label(text,rect,size=11,name=None,**attrs):
 attrs.setdefault('textcolor',INK);return control('comment',rect,name,text=text,fontsize=size,fontname='Helvetica Neue',**attrs)
def button(text,rect,name,command,size=10,bg=PALE,ink=INK):
 key=control('live.text',rect,name,text=text,texton=text,mode=0,parameter_enable=0,fontname='Helvetica Neue',fontsize=size,rounded=.12,bgcolor=bg,activebgcolor=bg,textcolor=ink,activetextcolor=ink,bordercolor=bg,focusbordercolor=GREEN)
 msg=p.box(command,'message');p.wire(key,msg);p.wire(msg,node);return key
control('panel',[0.,0.,640.,169.],'background',background=1,ignoreclick=1,bgcolor=CREAM,border=0,rounded=0.)
label('POCKET / LIVE',[16.,8.,150.,24.],13)
button('CLOUD',[174.,8.,65.,22.],'tab_cloud','mode 0');button('LOCAL',[245.,8.,65.,22.],'tab_local','mode 1')
label('●',[321.,10.,14.,18.],11,'dot',textcolor=MUTED)
status=label('Starting…',[338.,10.,140.,20.],9,'status',textcolor=MUTED)
count=label('Connecting controllers…',[477.,10.,147.,20.],8,'count',textcolor=MUTED,textjustification=2)
label('Your set. On your phone.',[152.,36.,472.,24.],18,'headline')
label('Scan the private QR code to connect.',[152.,62.,472.,16.],10,'subtitle',textcolor=MUTED)
qr=control('jsui',[16.,38.,120.,120.],'qr',filename=resource('panel.js'),numinlets=1,numoutlets=0,outlettype=[],border=0,ignoreclick=1)
url=control('textedit',[152.,81.,438.,28.],'url',numinlets=1,numoutlets=4,outlettype=['','','int',''],text='Preparing your connection…',fontsize=9.,fontname='Helvetica Neue',wordwrap=1,keymode=0,outputmode=1,readonly=0,tabmode=0,clickmode=0,border=0,rounded=0.,bgcolor=CREAM,textcolor=GREEN,bordercolor=CREAM,annotation='Click to select the complete link. Editing this field does not change the connection.')
defer=p.box('deferlow');select=p.box('select','message');p.wire(url,defer,2);p.wire(defer,select);p.wire(select,url)
button('⧉',[598.,81.,26.,26.],'copy','copy',18)
button('OPEN CONTROLLER',[152.,114.,165.,24.],'open','open',10,GREEN,CREAM)
# Local defaults to the same Wi-Fi. Scope/manual-port commands remain internal.
button('AUTO PORT',[328.,114.,110.,24.],'auto_port','localport 0',9)
label('Chooses a free port for you',[450.,119.,174.,14.],8,'auto_port_help',textcolor=MUTED)
notice=label('',[152.,139.,472.,13.],8,'notice',textcolor=MUTED)
label('Anyone with this private link can control this set.',[152.,154.,280.,12.],7,'footer',textcolor=MUTED)
label('Pocket '+(HERE/'VERSION').read_text().strip(),[430.,154.,94.,12.],8,textcolor=MUTED,textjustification=2)
label('Live …',[526.,154.,98.,12.],8,'live_version',textcolor=MUTED,textjustification=2)
ready=p.box('live.thisdevice');defer=p.box('deferlow');init=p.box('initialize','message');p.wire(ready,defer);p.wire(defer,init);p.wire(init,live)
# Read the actual audio sample rate for native device response renderers.
dsp=p.box('dspstate~');sr=p.box('prepend sample_rate');p.wire(ready,dsp);p.wire(dsp,sr,1);p.wire(sr,live)
p.wire(init,startup)
start = p.box('prepend script start') if args.portable else p.box('script start','message')
p.wire(startup,start);p.wire(start,node)
route=p.box('route command refresh status url qr browse controllerslabel notice panelmode panelscope connection presence startup_error');p.wire(node,route)
bridge_ready = p.box('bridge_ready', 'message')
p.wire(route,bridge_ready,2);p.wire(bridge_ready,startup)
startup_error = p.box('prepend startup_error')
p.wire(route,startup_error,12);p.wire(startup_error,startup)
lifecycle = p.box('route start loadend terminated')
p.wire(node,lifecycle,1)
for event_index, cause in enumerate((
    'Max could not launch the Node for Max process.',
    'Node for Max could not load the bridge script.',
    'The Node for Max process exited unexpectedly.',
)):
    errors = p.box('route error')
    failure = p.box('startup_error '+json.dumps(cause), 'message')
    p.wire(lifecycle,errors,event_index);p.wire(errors,failure);p.wire(failure,startup)
pre=p.box('prepend presence');p.wire(route,pre,11);p.wire(pre,live)
pre=p.box('prepend command');p.wire(route,pre);p.wire(pre,live)
refresh=p.box('refresh','message');p.wire(route,refresh,1);p.wire(refresh,live)
for outlet,target in [(2,status),(3,url),(6,count),(7,notice)]:
 pre=p.box('prepend set');p.wire(route,pre,outlet);p.wire(pre,target)
pre=p.box('prepend qr');p.wire(route,pre,4);p.wire(pre,qr)
browse=p.box('; max launchbrowser $1','message');p.wire(route,browse,5);p.wire(live,node)
for outlet,selector in [(8,'panelmode'),(9,'panelscope'),(10,'connection')]:
 pre=p.box('prepend '+selector);p.wire(route,pre,outlet);p.wire(pre,ui)
output=args.output or HERE/'Pocket Live.amxd'
p.save(output,640)
print(output)
