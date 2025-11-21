const USER_NAME = "kmadsdev";
const REPOSITORY_NAME = "curriculum";
const BRANCH_NAME = "main"; // or "master"
const contentsUrl = `https://api.github.com/repos/${USER_NAME}/${REPOSITORY_NAME}/contents/assets?ref=${BRANCH_NAME}`;
const root = document.getElementById('root');


function showError(text){
    root.innerHTML = `<div class="err">Error: ${escapeHtml(text)}</div>`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

/* parse timestamp from filename like cv_YYYY-MM-DD-hh-mm-ss.pdf or YYYY-MM-DD.pdf etc. */
    function parseDateFromName(name){
    // try full datetime first
    const reFull = /(\d{4})[-_](\d{2})[-_](\d{2})[_-](\d{2})[-_](\d{2})[-_](\d{2})/;
    const reDate = /(\d{4})[-_](\d{2})[-_](\d{2})/;
    let m = name.match(reFull);
    if(m){
        return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
    }
    m = name.match(reDate);
    if(m){
        return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    }
    return null;
}

/* fallback: get last commit date for a file */
async function getLastCommitDate(filePath){
    // commits API: latest commit for a path
    const url = `https://api.github.com/repos/${USER}/${REPO}/commits?path=${encodeURIComponent(filePath)}&per_page=1`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`Commit lookup failed (${res.status})`);
    const j = await res.json();
    if(!Array.isArray(j) || j.length === 0) return null;
    return new Date(j[0].commit.author.date || j[0].commit.committer.date);
}

(async function(){
    try{
        const res = await fetch(contentsUrl);
        const json = await res.json();

        if(!res.ok){
            // GitHub often returns {message: "...", documentation_url: "..."}
            const message = json && json.message ? json.message : `HTTP ${res.status}`;
            showError(message);
            return;
        }

        if(!Array.isArray(json)){
            showError("Unexpected API response — not a list. Check repo/path/branch and that 'assets' exists and is public.");
            return;
        }

        const pdfs = json.filter(f => typeof f.name === "string" && f.name.toLowerCase().endsWith(".pdf"));
        if(pdfs.length === 0){
            showError("No PDF files found in assets/.");
            return;
        }

        // 1) try filename timestamps (fast)
        const candidates = pdfs.map(f => {
            const dt = parseDateFromName(f.name);
            return { file: f, date: dt };
        });

        // if any filename had a parsable date, pick the newest by that date
        const withDate = candidates.filter(c => c.date instanceof Date && !isNaN(c.date));
        let chosen = null;

        if(withDate.length){
            withDate.sort((a,b)=>b.date - a.date);
            chosen = withDate[0].file;
        } else {
            // 2) fallback: query commits for each file to get last modified timestamp
            // show interim message
            root.querySelector('.msg').textContent = 'Determining latest PDF (checking file timestamps)...';

            // limit concurrency to avoid being too aggressive
            const tasks = pdfs.map(f => getLastCommitDate(f.path).then(d=>({file:f,date:d})).catch(()=>({file:f,date:null})));
            const results = await Promise.all(tasks);

            const withCommit = results.filter(r => r.date instanceof Date && !isNaN(r.date));
            if(withCommit.length){
                withCommit.sort((a,b)=>b.date - a.date);
                chosen = withCommit[0].file;
            } else {
                // as a final fallback, pick the largest file (probably latest)
                pdfs.sort((a,b)=>b.size - a.size);
                chosen = pdfs[0];
            }
        }

        // embed the chosen PDF
        const embed = document.createElement('embed');
        embed.src = chosen.download_url;
        embed.type = "application/pdf";
        embed.className = "embed-full";
        // replace root content
        document.body.innerHTML = '';
        document.body.appendChild(embed);

    } catch(err){
        showError(err.message || String(err));
    }
})();
