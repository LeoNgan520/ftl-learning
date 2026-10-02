// Portable ZIP (STORE) writer, UTF-8 names; no external library/network needed.
const encoder=new TextEncoder();
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
const block=(n)=>({bytes:new Uint8Array(n),view:null});
export function makeZip(files){const locals=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(files)){
 const filename=encoder.encode(name),body=encoder.encode(text),crc=crc32(body);
 const l=block(30);l.view=new DataView(l.bytes.buffer);l.view.setUint32(0,0x04034b50,true);l.view.setUint16(4,20,true);l.view.setUint16(6,0x0800,true);l.view.setUint16(12,0x21,true);l.view.setUint32(14,crc,true);l.view.setUint32(18,body.length,true);l.view.setUint32(22,body.length,true);l.view.setUint16(26,filename.length,true);
 locals.push(l.bytes,filename,body);
 const c=block(46);c.view=new DataView(c.bytes.buffer);c.view.setUint32(0,0x02014b50,true);c.view.setUint16(4,20,true);c.view.setUint16(6,20,true);c.view.setUint16(8,0x0800,true);c.view.setUint16(14,0x21,true);c.view.setUint32(16,crc,true);c.view.setUint32(20,body.length,true);c.view.setUint32(24,body.length,true);c.view.setUint16(28,filename.length,true);c.view.setUint32(42,offset,true);central.push(c.bytes,filename);offset+=30+filename.length+body.length;
 }
 const centralLength=central.reduce((n,b)=>n+b.length,0),end=block(22);end.view=new DataView(end.bytes.buffer);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,central.length/2,true);end.view.setUint16(10,central.length/2,true);end.view.setUint32(12,centralLength,true);end.view.setUint32(16,offset,true);
 const output=new Uint8Array(offset+centralLength+22);let at=0;for(const b of [...locals,...central,end.bytes]){output.set(b,at);at+=b.length;}return output;
}
