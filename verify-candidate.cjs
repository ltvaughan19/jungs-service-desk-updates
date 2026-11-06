// Public distribution helper. No application source or customer data is downloaded.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),{execFileSync}=require('node:child_process');
(async()=>{
 const repo=process.env.GITHUB_REPOSITORY,version=process.env.CANDIDATE_VERSION,expected=process.env.EXPECTED_SHA256,releaseId=process.env.CANDIDATE_RELEASE_ID;
 if(!/^\d+$/.test(releaseId)||repo!=='ltvaughan19/jungs-service-desk-updates'||!/^\d+\.\d+\.\d+$/.test(version)||!/^[a-f0-9]{64}$/i.test(expected))throw Error('Invalid candidate identity');
 const allowedHosts=new Set(['release-assets.githubusercontent.com','objects.githubusercontent.com']);
 let url=process.env.CANDIDATE_DOWNLOAD_URL,download;
 for(let redirects=0;redirects<4;redirects++){
  const parsed=new URL(url);if(parsed.protocol!=='https:'||!allowedHosts.has(parsed.hostname)||parsed.username||parsed.password)throw Error('Invalid temporary installer download location');
  download=await fetch(parsed,{redirect:'manual',signal:AbortSignal.timeout(120000)});
  if([301,302,303,307,308].includes(download.status)){const next=download.headers.get('location');await download.body?.cancel();if(!next)throw Error('Invalid installer redirect');url=new URL(next,parsed).href;continue;}break;
 }
 if(!download?.ok)throw Error('Temporary installer download failed');
 const chunks=[];let total=0;for await(const chunk of download.body){total+=chunk.length;if(total>200000000)throw Error('Installer exceeds size limit');chunks.push(chunk)}
 const bytes=Buffer.concat(chunks);if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected.toLowerCase()||bytes.subarray(0,2).toString()!=='MZ')throw Error('Installer does not match maintainer SHA256');
 const name=`Jungs-Service-Desk-Setup-${version}.exe`;
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'jungs-candidate-')),installer=path.join(folder,name);fs.writeFileSync(installer,bytes);
 const script=await fetch(`https://raw.githubusercontent.com/${repo}/${process.env.GITHUB_SHA}/test-installer.ps1`);if(!script.ok)throw Error('Pinned verification script missing');const ps=path.join(folder,'test-installer.ps1');fs.writeFileSync(ps,await script.text());
 const output=execFileSync('pwsh',['-NoProfile','-NonInteractive','-File',ps,'-Installer',installer],{encoding:'utf8',timeout:420000,windowsHide:true,env:Object.fromEntries(Object.entries(process.env).filter(([name])=>!['CANDIDATE_DOWNLOAD_URL','GH_TOKEN','GITHUB_TOKEN','JUNGS_UPDATE_SIGNING_KEY'].includes(name)))});
 const reportFile=output.match(/Installer verification report: (.+)/)?.[1]?.trim();if(!reportFile)throw Error('No installer report');const report=JSON.parse(fs.readFileSync(reportFile,'utf8').replace(/^\uFEFF/,''));
 if(!report.installed||!report.applicationCheckPassed||!report.uninstalled||report.error)throw Error('Installed checks failed');
 const result={version,sha256:expected.toUpperCase(),installed:true,applicationCheckPassed:true,uninstalled:true,os:os.type()+' '+os.release(),runner:process.env.RUNNER_OS,workflowRun:process.env.GITHUB_RUN_ID,checkedAt:new Date().toISOString()};
 fs.appendFileSync(process.env.GITHUB_OUTPUT,'result='+Buffer.from(JSON.stringify(result)).toString('base64')+'\n');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
