// A raster PDF preserves Cyrillic and the exact layout without external fonts.
export function jpegPdf(jpeg,width,height){
  const encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0;
  const put=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);length+=bytes.length;};
  const object=(id,body)=>{offsets[id]=length;put(`${id} 0 obj\n${body}\nendobj\n`);};
  put('%PDF-1.4\n');
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  offsets[4]=length;put(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);put(jpeg);put('\nendstream\nendobj\n');
  const ratio=Math.min(802/width,555/height),w=width*ratio,h=height*ratio;
  const stream=`q ${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${((842-w)/2).toFixed(3)} ${((595-h)/2).toFixed(3)} cm /Im0 Do Q\n`;
  object(5,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
  const xref=length;put('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)put(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  put(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks,{type:'application/pdf'});
}
export async function exportSketch(svg,format){
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try{
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=2260;canvas.height=1700;
    const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,format==='pdf'?'image/jpeg':'image/png',.95));
    if(!blob)throw new Error('Не удалось сформировать изображение эскиза.');
    return format==='pdf'?jpegPdf(new Uint8Array(await blob.arrayBuffer()),canvas.width,canvas.height):blob;
  }finally{URL.revokeObjectURL(url);}
}
