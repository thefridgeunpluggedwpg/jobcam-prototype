/* JobCam: draw the client-link QR code right on the phone (no network, no outside QR service).
   Uses the vendored qrcode.js (qrcode-generator by Kazuhiko Arase, MIT). Dark on white, 4-module quiet zone,
   error correction Q (survives glare / a scuffed screen better than M). */
'use strict';
window.JobcamQR={
  svg(text,opts){
    const o=Object.assign({ecc:'Q',quiet:4,size:280},opts||{});
    if(typeof qrcode!=='function')throw Error('QR library missing');
    const qr=qrcode(0,o.ecc);qr.addData(String(text),'Byte');qr.make();
    const n=qr.getModuleCount(),t=n+o.quiet*2;let d='';
    for(let r=0;r<n;r++){let c=0;while(c<n){if(!qr.isDark(r,c)){c++;continue}let e=c;while(e<n&&qr.isDark(r,e))e++;d+='M'+(c+o.quiet)+' '+(r+o.quiet)+'h'+(e-c)+'v1h-'+(e-c)+'z';c=e}}
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+t+' '+t+'" width="'+o.size+'" height="'+o.size+'" style="display:block;width:'+o.size+'px;max-width:100%;height:auto;aspect-ratio:1/1;margin:0 auto" shape-rendering="crispEdges" role="img" aria-label="QR code for the client link"><rect x="0" y="0" width="'+t+'" height="'+t+'" style="fill:#ffffff;stroke:none"/><path style="fill:#000000;stroke:none" d="'+d+'"/></svg>';
  }
};
