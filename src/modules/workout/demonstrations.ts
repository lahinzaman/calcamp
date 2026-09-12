/** Original Lottie shape animations: side-view joint paths by movement family. */
type Point = [number, number];
type Pose = { head: Point; shoulder: Point; hip: Point; knee: Point; foot: Point; elbow: Point; hand: Point };
const standing: Pose = { head:[120,38], shoulder:[120,65], hip:[120,133], knee:[122,185], foot:[122,233], elbow:[128,103], hand:[134,140] };
export const DEMO_KINDS = ['press','pushup','fly','row','pulldown','pullup','overhead','raise','rear','squat','legpress','lunge','hinge','bridge','legcurl','legextension','calf','curl','extension','crunch'] as const;
export function demonstration(kind: string) {
  let a = { ...standing }, b = { ...standing };
  switch (kind) {
    case 'squat': b = { ...a, head:[102,80], shoulder:[105,105], hip:[88,164], knee:[151,190], elbow:[145,115], hand:[167,100] }; break;
    case 'lunge': a = { ...a, foot:[162,233], knee:[151,181] }; b = { ...a, head:[113,83], shoulder:[116,110], hip:[116,170], knee:[164,182] }; break;
    case 'hinge': b = { ...a, head:[182,103], shoulder:[168,116], hip:[96,146], knee:[112,190], elbow:[172,155], hand:[175,196] }; break;
    case 'calf': b = Object.fromEntries(Object.entries(a).map(([k,p]) => [k, [p[0],p[1]-(k === 'foot' ? 0 : 15)]])) as Pose; break;
    case 'curl': b = { ...a, hand:[157,68] }; break;
    case 'extension': a = { ...a, elbow:[132,104], hand:[173,102] }; b = { ...a, hand:[138,145] }; break;
    case 'overhead': a = { ...a, elbow:[165,90], hand:[164,52] }; b = { ...a, elbow:[128,32], hand:[124,8] }; break;
    case 'raise': b = { ...a, elbow:[160,68], hand:[208,70] }; break;
    case 'fly': a = { ...a, elbow:[160,74], hand:[204,80] }; b = { ...a, elbow:[133,78], hand:[146,93] }; break;
    case 'rear': a = { ...a, head:[173,86], shoulder:[152,106], hip:[105,144], elbow:[155,150], hand:[155,196] }; b = { ...a, elbow:[195,103], hand:[232,98] }; break;
    case 'row': a = { ...a, elbow:[165,77], hand:[208,89] }; b = { ...a, elbow:[85,92], hand:[132,103] }; break;
    case 'pulldown': a = { ...a, elbow:[139,32], hand:[154,5], knee:[169,134], foot:[173,230] }; b = { ...a, elbow:[164,88], hand:[147,67] }; break;
    case 'pullup': a = { ...a, elbow:[134,35], hand:[143,5] }; b = { ...a, head:[126,12], shoulder:[127,37], hip:[127,98], knee:[127,152], foot:[127,207], elbow:[164,51] }; break;
    case 'press': a = { head:[55,170], shoulder:[79,178], hip:[149,178], knee:[196,188], foot:[198,231], elbow:[115,169], hand:[101,130] }; b = { ...a, elbow:[85,135], hand:[86,91] }; break;
    case 'pushup': a = { head:[179,105], shoulder:[164,124], hip:[98,158], knee:[62,187], foot:[25,225], elbow:[159,175], hand:[159,231] }; b = { ...a, head:[186,169], shoulder:[165,188], hip:[98,202], knee:[62,216], elbow:[200,210] }; break;
    case 'legpress': a = { head:[45,122], shoulder:[59,146], hip:[98,190], knee:[127,119], foot:[186,151], elbow:[64,182], hand:[96,193] }; b = { ...a, knee:[150,138], foot:[203,83] }; break;
    case 'legcurl': a = { ...a, knee:[178,140], foot:[223,181] }; b = { ...a, foot:[165,198] }; break;
    case 'legextension': a = { ...a, knee:[179,143], foot:[184,203] }; b = { ...a, foot:[232,146] }; break;
    case 'bridge': a = { head:[37,222], shoulder:[66,222], hip:[121,220], knee:[164,171], foot:[201,231], elbow:[89,228], hand:[122,231] }; b = { ...a, hip:[124,181] }; break;
    case 'crunch': a = { head:[40,197], shoulder:[65,212], hip:[132,226], knee:[166,175], foot:[208,232], elbow:[84,179], hand:[56,183] }; b = { ...a, head:[63,154], shoulder:[83,180], elbow:[104,153], hand:[80,141] }; break;
  }
  const shape = (points: Point[]) => ({ i:points.map(() => [0,0]), o:points.map(() => [0,0]), v:points, c:false });
  const ease = { i:{x:.4,y:1}, o:{x:.6,y:0} };
  /** Two-pose loop: out on the concentric, back on the eccentric, with a hold at each end. */
  const pathFrames = (start: unknown, end: unknown) => ({ a:1, k:[
    { t:0, s:[start], e:[end], ...ease }, { t:38, s:[end], e:[end], ...ease },
    { t:52, s:[end], e:[start], ...ease }, { t:90, s:[start] }] });
  const pointFrames = (start: Point, end: Point) => ({ a:1, k:[
    { t:0, s:start, e:end, ...ease }, { t:38, s:end, e:end, ...ease },
    { t:52, s:end, e:start, ...ease }, { t:90, s:start } ] });

  const INK: [number,number,number,number] = [.55,.6,1,1];
  const LIMB: [number,number,number,number] = [1,.7,.25,1];
  const FAINT: [number,number,number,number] = [.55,.6,1,.38];
  const GEAR: [number,number,number,number] = [.42,.86,.62,1];
  const stroke = (color: [number,number,number,number], width: number) => ({ ty:'st', c:{a:0,k:color}, o:{a:0,k:100}, w:{a:0,k:width}, lc:2, lj:2 });
  const transform = { ty:'tr', p:{a:0,k:[0,0]}, a:{a:0,k:[0,0]}, s:{a:0,k:[100,100]}, r:{a:0,k:0}, o:{a:0,k:100} };
  const chain = (keys: (keyof Pose)[], color: [number,number,number,number], width: number) =>
    ({ ty:'gr', it:[{ ty:'sh', ks: pathFrames(shape(keys.map(k => a[k])), shape(keys.map(k => b[k]))) }, stroke(color, width), transform] });
  /** The far-side limb, nudged back and drawn faintly, reads as depth without a second figure. */
  const offset = (pose: Pose, keys: (keyof Pose)[], dx: number): Point[] => keys.map(k => [pose[k][0] - dx, pose[k][1]] as Point);
  const farChain = (keys: (keyof Pose)[], dx: number) =>
    ({ ty:'gr', it:[{ ty:'sh', ks: pathFrames(shape(offset(a, keys, dx)), shape(offset(b, keys, dx))) }, stroke(FAINT, 7), transform] });

  const head = { ty:'gr', it:[
    { ty:'el', p: pointFrames(a.head, b.head), s:{a:0,k:[30,30]} },
    stroke(INK, 7), transform] };
  const ground = { ty:'gr', it:[
    { ty:'sh', ks:{ a:0, k: shape([[16,244],[244,244]]) } }, stroke(FAINT, 4), transform] };

  const gear: Record<string, 'bar'|'dumbbell'|'none'> = { press:'bar', pushup:'none', fly:'dumbbell', row:'bar', pulldown:'bar',
    pullup:'none', overhead:'bar', raise:'dumbbell', rear:'dumbbell', squat:'bar', legpress:'none', lunge:'dumbbell',
    hinge:'bar', bridge:'bar', legcurl:'none', legextension:'none', calf:'none', curl:'dumbbell', extension:'dumbbell', crunch:'none' };
  const held = gear[kind] ?? 'none';
  const barAt = (pose: Pose, half: number): Point[] => [[pose.hand[0], pose.hand[1] - half], [pose.hand[0], pose.hand[1] + half]];
  const equipment = held === 'none' ? [] : [{ ty:'gr', it:[
    { ty:'sh', ks: pathFrames(shape(barAt(a, held === 'bar' ? 46 : 16)), shape(barAt(b, held === 'bar' ? 46 : 16))) },
    stroke(GEAR, held === 'bar' ? 8 : 12), transform] }];

  const shapes = [
    ground,
    farChain(['shoulder','hip','knee','foot'], 12),
    farChain(['shoulder','elbow','hand'], 12),
    chain(['shoulder','hip','knee','foot'], INK, 10),
    chain(['shoulder','elbow','hand'], LIMB, 10),
    head,
    ...equipment,
  ];
  return { v:'5.7.4', fr:30, ip:0, op:91, w:260, h:260, nm:`CalCamp ${kind} schematic`, ddd:0, assets:[], layers:[{
    ddd:0, ind:1, ty:4, nm:'movement', sr:1,
    ks:{ o:{a:0,k:100}, r:{a:0,k:0}, p:{a:0,k:[0,0,0]}, a:{a:0,k:[0,0,0]}, s:{a:0,k:[100,100,100]} }, ao:0,
    shapes, ip:0, op:91, st:0, bm:0,
  }] };
}
