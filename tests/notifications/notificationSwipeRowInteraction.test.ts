import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

// Run the actual component handlers with persistent hook cells. Pointer capture
// transfer/loss is injected explicitly, including the child event that bubbles
// on touch devices; these tests do not pretend to be a physical-device browser.
let server: ViteDevServer;
let Component: Function;
before(async () => {
  server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',plugins:[react(),{
    name:'swipe-row-hook-harness',enforce:'pre',
    resolveId(source){if(source==='virtual:swipe-hooks')return '\0swipe-hooks';},
    transform(code,id){if(id.includes('/NotificationSwipeRow.tsx'))return code.replace(/from ['"]react['"]/, "from 'virtual:swipe-hooks'");},
    load(id){if(id==='\0swipe-hooks')return 'export const useRef=(value)=>globalThis.__swipeHooks.ref(value);export const useState=(value)=>globalThis.__swipeHooks.state(value)';},
  }]});
  Component=(await server.ssrLoadModule('/src/features/notifications/components/NotificationSwipeRow.tsx')).NotificationSwipeRow;
});
after(async()=>{await server.close();});
function fixture(read=false,throwsCapture=false) {
  let cursor=0;const cells:any[]=[];const actions={open:0,read:0,delete:0};const captured=new Set<number>();
  const hooks={ref(value:any){const i=cursor++;return cells[i]??=( {current:value} );},state(value:any){const i=cursor++;if(!(i in cells))cells[i]=value;return [cells[i],(next:any)=>{cells[i]=typeof next==='function'?next(cells[i]):next;}];}};
  const target={closest:()=>null};
  const row={setPointerCapture(id:number){if(throwsCapture)throw Error('capture unavailable');captured.add(id);},hasPointerCapture(id:number){return captured.has(id);}};
  const render=()=>{cursor=0;(globalThis as any).__swipeHooks=hooks;return Component({read,title:'اعلان',children:'متن اعلان',onOpen:()=>{actions.open++;},onRead:async()=>{actions.read++;},onDelete:async()=>{actions.delete++;}}).props.children[1];};
  const event=(dx=0,dy=0,overrides:any={})=>({pointerId:1,isPrimary:true,pointerType:'touch',button:0,clientX:200+dx,clientY:100+dy,target,currentTarget:row,preventDefault(){this.prevented=true;},prevented:false,...overrides});
  return {render,event,actions,row,target,captured};
}
test('swipes beginning on nested text survive bubbled child capture loss in both physical directions', async()=>{
  for(const dx of [-100,100]) {
    const h=fixture();let front=h.render();front.props.onPointerDown(h.event());
    assert.ok(h.captured.has(1),'row owns capture immediately on touch down');
    front.props.onPointerMove(h.event(dx,4));front=h.render();assert.equal(front.props.style.transform,`translateX(${dx}px)`);
    front.props.onLostPointerCapture(h.event(dx,4)); // target is the child, not the row
    front.props.onPointerUp(h.event(dx,4));front.props.onClick();await Promise.resolve();
    assert.equal(h.actions.delete,dx<0?1:0);assert.equal(h.actions.read,dx>0?1:0);assert.equal(h.actions.open,0);
  }
});
test('diagonal start can settle into a horizontal swipe instead of locking vertically',async()=>{
  const h=fixture();const front=h.render();front.props.onPointerDown(h.event());front.props.onPointerMove(h.event(12,10));
  front.props.onPointerMove(h.event(90,18));front.props.onPointerUp(h.event(90,18));await Promise.resolve();assert.equal(h.actions.read,1);
});
test('vertical scroll and pointer cancellation never read, delete or open a notification',()=>{
  const h=fixture();const front=h.render();front.props.onPointerDown(h.event());const move=h.event(8,90);front.props.onPointerMove(move);
  assert.equal(move.prevented,false);front.props.onPointerCancel();front.props.onPointerUp(h.event(8,90));front.props.onClick();
  assert.deepEqual(h.actions,{open:0,read:0,delete:0});
});
test('own capture loss and second-finger zoom cancel a pending destructive swipe',()=>{
  for(const secondFinger of [false,true]){
    const h=fixture();const front=h.render();front.props.onPointerDown(h.event());front.props.onPointerMove(h.event(-100,0));
    if(secondFinger)front.props.onPointerDown(h.event(0,0,{pointerId:2,isPrimary:false}));
    else front.props.onLostPointerCapture(h.event(-100,0,{target:h.row}));
    front.props.onPointerUp(h.event(-100,0));front.props.onClick();assert.deepEqual(h.actions,{open:0,read:0,delete:0});
  }
});
test('capture API failure does not break swipes; taps still open and read rows cannot be read twice',async()=>{
  const h=fixture(false,true);const front=h.render();assert.doesNotThrow(()=>front.props.onPointerDown(h.event()));
  assert.doesNotThrow(()=>front.props.onPointerMove(h.event(100,0)));front.props.onPointerUp(h.event(100,0));await Promise.resolve();assert.equal(h.actions.read,1);
  const tap=fixture();const tapped=tap.render();tapped.props.onPointerDown(tap.event());tapped.props.onPointerUp(tap.event(3,2));tapped.props.onClick();assert.equal(tap.actions.open,1);
  const read=fixture(true);const readRow=read.render();readRow.props.onPointerDown(read.event());readRow.props.onPointerMove(read.event(100,0));readRow.props.onPointerUp(read.event(100,0));assert.equal(read.actions.read,0);
});
test('rows expose notification content without individual action buttons', () => {
  assert.equal(fixture().render().props.children, 'متن اعلان');
});

test('a fast ambiguous drag without a move event does not become a click',()=>{
  const h=fixture();const front=h.render();front.props.onPointerDown(h.event());front.props.onPointerUp(h.event(40,40));front.props.onClick();
  assert.deepEqual(h.actions,{open:0,read:0,delete:0});
});
