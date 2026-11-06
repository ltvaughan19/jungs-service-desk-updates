// Public distribution helper. No application source or customer data is downloaded.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),{execFileSync}=require('node:child_process');
(async()=>{
 const repo=process.env.GITHUB_REPOSITORY,version=process.env.CANDIDATE_VERSION,expected=process.env.EXPECTED_SHA256;
 if(repo!=='ltvaughan19/jungs-service-desk-updates'||!/^\d+\.\d+\.\d+$/.test(version)||!/^[a-f0-9]{64}$/i.test(expected))throw Error('Invalid candidate identity');
 const headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','User-Agent':'Jungs-Candidate-Verification'};
 const r=await fetch(`https://api.github.com/repos/${repo}/releases/tags/candidate-${version}`,{headers});if(!r.ok)throw Error('Candidate lookup '+r.status);const release=await r.json();if(!release.draft)throw Error('Verification requires an unpublished candidate');
 const name=`Jungs-Service-Desk-Setup-${version}.exe`,asset=release.assets.find(a=>a.name===name);if(!asset||asset.size>200000000)throw Error('Candidate installer missing or too large');
 const download=await fetch(asset.url,{headers:{...headers,Accept:'application/octet-stream'}});if(!download.ok)throw Error('Installer download '+download.status);const bytes=Buffer.from(await download.arrayBuffer());if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected.toLowerCase()||bytes.subarray(0,2).toString()!=='MZ')throw Error('Installer does not match maintainer SHA256');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'jungs-candidate-')),installer=path.join(folder,name);fs.writeFileSync(installer,bytes);
 const script=await fetch(`https://raw.githubusercontent.com/${repo}/${process.env.GITHUB_SHA}/test-installer.ps1`);if(!script.ok)throw Error('Pinned verification script missing');const ps=path.join(folder,'test-installer.ps1');fs.writeFileSync(ps,await script.text());
 const output=execFileSync('pwsh',['-NoProfile','-NonInteractive','-File',ps,'-Installer',installer],{encoding:'utf8',timeout:420000,windowsHide:true});
 const reportFile=output.match(/Installer verification report: (.+)/)?.[1]?.trim();if(!reportFile)throw Error('No installer report');const report=JSON.parse(fs.readFileSync(reportFile,'utf8').replace(/^\uFEFF/,''));
 if(!report.installed||!report.applicationCheckPassed||!report.uninstalled||report.error)throw Error('Installed checks failed');
 const result={version,sha256:expected.toUpperCase(),installed:true,applicationCheckPassed:true,uninstalled:true,os:os.type()+' '+os.release(),runner:process.env.RUNNER_OS,workflowRun:process.env.GITHUB_RUN_ID,checkedAt:new Date().toISOString()};
 fs.appendFileSync(process.env.GITHUB_OUTPUT,'result='+Buffer.from(JSON.stringify(result)).toString('base64')+'\n');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
