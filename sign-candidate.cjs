// This job never executes the installer; signing runs in a separate VM from tests.
const crypto=require('node:crypto');
(async()=>{
 const repo=process.env.GITHUB_REPOSITORY,version=process.env.CANDIDATE_VERSION,expected=process.env.EXPECTED_SHA256,releaseId=process.env.CANDIDATE_RELEASE_ID;
 if(!/^\d+$/.test(releaseId)||repo!=='ltvaughan19/jungs-service-desk-updates'||!/^\d+\.\d+\.\d+$/.test(version)||!/^[a-f0-9]{64}$/i.test(expected))throw Error('Invalid candidate identity');
 const proof=JSON.parse(Buffer.from(process.env.WINDOWS_RESULT||'','base64').toString());if(proof.version!==version||proof.sha256!==expected.toUpperCase()||!proof.installed||!proof.applicationCheckPassed||!proof.uninstalled)throw Error('Windows verification is required before signing');
 const headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','User-Agent':'Jungs-Candidate-Signing'};
 const r=await fetch(`https://api.github.com/repos/${repo}/releases/${releaseId}`,{headers});if(!r.ok)throw Error('Candidate lookup failed');const release=await r.json();if(release.tag_name!=='candidate-'+version||!release.draft)throw Error('Only draft candidates can be signed');
 const name=`Jungs-Service-Desk-Setup-${version}.exe`,asset=release.assets.find(a=>a.name===name);if(!asset||asset.size>200000000)throw Error('Candidate installer missing');
 const download=await fetch(asset.url,{headers:{...headers,Accept:'application/octet-stream'}});if(!download.ok)throw Error('Installer download failed');const bytes=Buffer.from(await download.arrayBuffer());if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected.toLowerCase())throw Error('Candidate changed after Windows verification');
 const key=crypto.createPrivateKey(process.env.JUNGS_UPDATE_SIGNING_KEY||'');if(key.asymmetricKeyType!=='ed25519')throw Error('Ed25519 signing secret is required');
 const payload={format:'jungs-update-v1',version,files:[{name,size:bytes.length,sha512:crypto.createHash('sha512').update(bytes).digest('base64')}]};
 const envelope={payload,signature:crypto.sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64')};
 for(const [filename,data] of [['security-manifest.json',envelope],['WINDOWS-INSTALL-CHECKS.json',proof]]){
   const old=release.assets.find(a=>a.name===filename);if(old){const d=await fetch(old.url,{method:'DELETE',headers});if(!d.ok)throw Error('Cannot replace candidate receipt');}
   const url=new URL(release.upload_url.split('{')[0]);if(url.hostname!=='uploads.github.com')throw Error('Unexpected upload destination');url.searchParams.set('name',filename);
   const upload=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(data,null,2)+'\n'});if(!upload.ok)throw Error('Receipt upload '+upload.status);
 }
 console.log('Windows-tested candidate signed. Private key was not written to disk or logs. Candidate remains unpublished.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
