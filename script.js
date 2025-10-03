// key for localStorage
const STORAGE_KEY = 'subscribers_db_v1';

// DOM
const subscribersContainer = document.getElementById('subscribersContainer');
const searchInput = document.getElementById('searchInput');
const groupFilter = document.getElementById('groupFilter');
const importJson = document.getElementById('importJson');
const exportJson = document.getElementById('exportJson');
const btnAddSubscriber = document.getElementById('btnAddSubscriber');
const btnAddGroup = document.getElementById('btnAddGroup');

const modal = document.getElementById('modal');
const promptModal = document.getElementById('promptModal');
const promptInput = document.getElementById('promptInput');
const promptOk = document.getElementById('promptOk');
const promptCancel = document.getElementById('promptCancel');

const subscriberForm = document.getElementById('subscriberForm');
const modalTitle = document.getElementById('modalTitle');
const groupSelect = document.getElementById('groupSelect');
const cancelBtn = document.getElementById('cancelBtn');

let db = { groups: [], subscribers: [] };
let editingId = null;

// helper date -> YYYY-MM-DD
function todayISO(){
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// load from localStorage
function loadDB(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try{ db = JSON.parse(raw); }
    catch(e){ console.error('Invalid db in storage', e); localStorage.removeItem(STORAGE_KEY); db = {groups:[],subscribers:[]}; }
  }
}
function saveDB(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }

// merge imported
function mergeImported(importObj){
  // expect {groups: [...], subscribers:[...]}
  if(!importObj) return;
  // add groups without duplicates
  if(Array.isArray(importObj.groups)){
    importObj.groups.forEach(g=>{
      if(!db.groups.includes(g)) db.groups.push(g);
    });
  }
  // add subscribers: use phone as unique
  if(Array.isArray(importObj.subscribers)){
    importObj.subscribers.forEach(s=>{
      const exists = db.subscribers.find(x=>x.phone === s.phone);
      if(!exists){
        // ensure months array exists, else create template
        if(!s.months || !Array.isArray(s.months)){
          s.months = Array.from({length:12}, (_,i)=>({month:i,monthName: monthNames[i], paid:false, datePaid:null, amountPaid:null}));
        }
        db.subscribers.push(s);
      } else {
        // if exists, you may choose to merge months: keep existing months unless imported has newer paid flags
        s.months && s.months.forEach(m=>{
          const idx = exists.months.findIndex(mm=>mm.month === m.month);
          if(idx>-1){
            // if imported shows paid and existing not paid, update
            if(m.paid && !exists.months[idx].paid){
              exists.months[idx] = m;
            }
          }
        });
      }
    });
  }
  saveDB();
  render();
}

// months names Arabic
const monthNames = ["يناير","فبراير","مارس","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
// NOTE: small fix: remove duplicate "مارس". Let's correct:
monthNames[2] = "مارس";
monthNames[3] = "أبريل";

// UI population
function populateGroups(){
  // clear selects
  groupFilter.innerHTML = '<option value="all">كل المجموعات</option>';
  groupSelect.innerHTML = '';
  db.groups.forEach(g=>{
    const opt = document.createElement('option'); opt.value = g; opt.textContent = g; groupFilter.appendChild(opt);
    const opt2 = document.createElement('option'); opt2.value = g; opt2.textContent = g; groupSelect.appendChild(opt2);
  });
}

// render subscribers based on filter & search
function render(){
  populateGroups();
  const q = searchInput.value.trim().toLowerCase();
  const selectedGroup = groupFilter.value;
  const list = db.subscribers.filter(s=>{
    if(selectedGroup !== 'all' && s.group !== selectedGroup) return false;
    if(!q) return true;
    return s.name.toLowerCase().includes(q) || s.phone.includes(q);
  });

  subscribersContainer.innerHTML = '';
  if(list.length === 0){
    subscribersContainer.innerHTML = `<div class="card">لا يوجد مشتركين</div>`;
    return;
  }

  list.forEach(sub => {
    const card = document.createElement('div'); card.className='card';
    const head = document.createElement('div'); head.className='head';
    const title = document.createElement('h3'); title.textContent = sub.name;
    const actions = document.createElement('div'); actions.className='actions';

    const editBtn = document.createElement('button'); editBtn.className='btn'; editBtn.textContent='تعديل';
    editBtn.onclick = ()=> openEditModal(sub.id);

    const delBtn = document.createElement('button'); delBtn.className='btn'; delBtn.textContent='حذف';
    delBtn.onclick = ()=> {
      if(confirm(`هل تريد حذف ${sub.name}؟`)){
        db.subscribers = db.subscribers.filter(x=>x.id !== sub.id);
        saveDB(); render();
      }
    };

    actions.appendChild(editBtn); actions.appendChild(delBtn);
    head.appendChild(title); head.appendChild(actions);

    const meta = document.createElement('div'); meta.className='meta';
    meta.innerHTML = `
      <div class="row small"> 
        <div>📞 ${sub.phone}</div>
        <div> | نت: ${sub.gigabytes} جيجا</div>
        <div> | دقايق: ${sub.minutes}</div>
        <div> | سعر: ${sub.pricePerMonth} ج</div>
        <div> | مجموعة: ${sub.group || '—'}</div>
      </div>
    `;

    // months grid
    const monthsWrap = document.createElement('div'); monthsWrap.className='months';
    // ensure months array exists and length 12
    if(!Array.isArray(sub.months) || sub.months.length !== 12){
      sub.months = Array.from({length:12}, (_,i)=>({month:i, monthName: monthNames[i] || `شهر ${i+1}`, paid:false, datePaid:null, amountPaid:null}));
    }
    sub.months.forEach(m=>{
      const mEl = document.createElement('div'); mEl.className='month';
      mEl.textContent = m.monthName;
      if(m.paid) mEl.classList.add('paid');
      mEl.onclick = ()=> onMonthClick(sub.id, m.month);
      monthsWrap.appendChild(mEl);
    });

    card.appendChild(head);
    card.appendChild(meta);
    card.appendChild(monthsWrap);
    subscribersContainer.appendChild(card);
  });
}

// when month clicked -> confirm -> toggle paid
function onMonthClick(subId, monthIndex){
  const sub = db.subscribers.find(s=>s.id === subId);
  if(!sub) return;
  const m = sub.months.find(x=>x.month === monthIndex);
  if(!m) return;

  // if already paid, ask to unmark
  if(m.paid){
    if(confirm(`دفع مسجّل للشهر "${m.monthName}" بتاريخ ${m.datePaid} — هل تود إلغاء الدفع؟`)){
      m.paid = false; m.datePaid = null; m.amountPaid = null;
      saveDB(); render();
    }
    return;
  }

  // Not paid yet -> confirm to register. Ask for amount (default pricePerMonth)
  const ok = confirm(`هل أنت متأكد من تسجيل دفع ل"${sub.name}" لشهر ${m.monthName}؟`);
  if(!ok) return;
  let defaultAmount = sub.pricePerMonth || 0;
  let amountStr = prompt(`اكتب المبلغ المدفوع (الافتراضي ${defaultAmount}):`, String(defaultAmount));
  if(amountStr === null){ return; } // cancelled
  const amount = Number(amountStr) || defaultAmount;
  m.paid = true;
  m.datePaid = todayISO();
  m.amountPaid = amount;
  saveDB(); render();
}

// modal open for add
btnAddSubscriber.addEventListener('click', ()=>{
  editingId = null;
  openAddModal();
});

function openAddModal(){
  modalTitle.textContent = 'أضف عميل جديد';
  subscriberForm.reset();
  // ensure at least one group exists
  if(db.groups.length === 0){
    db.groups.push('عام');
    saveDB();
  }
  populateGroups();
  modal.classList.remove('hidden');
}

function openEditModal(id){
  const sub = db.subscribers.find(s=>s.id === id);
  if(!sub) return;
  editingId = id;
  modalTitle.textContent = 'تعديل بيانات العميل';
  subscriberForm.name.value = sub.name;
  subscriberForm.phone.value = sub.phone;
  subscriberForm.gigabytes.value = sub.gigabytes;
  subscriberForm.minutes.value = sub.minutes;
  subscriberForm.pricePerMonth.value = sub.pricePerMonth;
  populateGroups();
  subscriberForm.group.value = sub.group;
  modal.classList.remove('hidden');
}

// form submit
subscriberForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const form = new FormData(subscriberForm);
  const obj = {
    name: form.get('name').trim(),
    phone: form.get('phone').trim(),
    gigabytes: Number(form.get('gigabytes')) || 0,
    minutes: Number(form.get('minutes')) || 0,
    pricePerMonth: Number(form.get('pricePerMonth')) || 0,
    group: form.get('group') || 'عام'
  };

  // ensure group exists
  if(!db.groups.includes(obj.group)) db.groups.push(obj.group);

  if(editingId){
    const idx = db.subscribers.findIndex(s=>s.id === editingId);
    if(idx>-1){
      // keep months if present
      const months = db.subscribers[idx].months || Array.from({length:12}, (_,i)=>({month:i, monthName: monthNames[i], paid:false, datePaid:null, amountPaid:null}));
      db.subscribers[idx] = { ...db.subscribers[idx], ...obj, months };
    }
  } else {
    // generate id (simple)
    const id = 'id_' + Math.random().toString(36).slice(2,11);
    const months = Array.from({length:12}, (_,i)=>({month:i, monthName: monthNames[i] || `شهر ${i+1}`, paid:false, datePaid:null, amountPaid:null}));
    // avoid adding duplicate phone
    const exists = db.subscribers.find(s=>s.phone === obj.phone);
    if(exists){
      if(!confirm('يوجد مشترك بنفس الرقم. هل تريد إضافة نسخة جديدة؟')){ modal.classList.add('hidden'); return; }
    }
    db.subscribers.push({ id, ...obj, months });
  }

  saveDB();
  modal.classList.add('hidden');
  render();
});

// cancel modal
cancelBtn.addEventListener('click', ()=> modal.classList.add('hidden'));

// add group prompt
btnAddGroup.addEventListener('click', ()=>{
  promptInput.value = '';
  promptModal.classList.remove('hidden');
  promptInput.focus();
});
promptCancel.addEventListener('click', ()=> promptModal.classList.add('hidden'));
promptOk.addEventListener('click', ()=>{
  const name = promptInput.value.trim();
  if(!name){ alert('ادخل اسم للمجموعة'); return; }
  if(!db.groups.includes(name)) db.groups.push(name);
  saveDB();
  promptModal.classList.add('hidden');
  render();
});

// search & filter
searchInput.addEventListener('input', render);
groupFilter.addEventListener('change', render);

// import JSON file input
importJson.addEventListener('change', (ev)=>{
  const f = ev.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const parsed = JSON.parse(e.target.result);
      // if the file is plain array of subscribers (older format), normalize:
      if(Array.isArray(parsed)) mergeImported({groups: [], subscribers: parsed});
      else mergeImported(parsed);
      alert('تم استيراد الملف ودمجه مع البيانات بنجاح');
    }catch(err){
      alert('خطأ في قراءة الملف: ' + err.message);
      console.error(err);
    }
  };
  reader.readAsText(f,'utf-8');
  // reset input
  ev.target.value = '';
});

// export JSON
exportJson.addEventListener('click', ()=>{
  const data = JSON.stringify(db, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `subscribers_export_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});



const selectedGroup = groupFilter.value.trim().toLowerCase();
const list = db.subscribers.filter(s=>{
  const subGroup = (s.group || '').trim().toLowerCase();

  // فلترة بالمجموعة
  if(selectedGroup !== 'all' && subGroup !== selectedGroup) return false;

  // فلترة بالبحث
  if(!q) return true;
  return s.name.toLowerCase().includes(q) || s.phone.includes(q);
});
function populateGroups(){
  // احفظ المجموعة المختارة قبل ما نمسح القائمة
  const current = groupFilter.value;

  groupFilter.innerHTML = '<option value="all">كل المجموعات</option>';
  groupSelect.innerHTML = '';

  db.groups.forEach(g=>{
    const opt = document.createElement('option'); 
    opt.value = g; 
    opt.textContent = g; 
    groupFilter.appendChild(opt);

    const opt2 = document.createElement('option'); 
    opt2.value = g; 
    opt2.textContent = g; 
    groupSelect.appendChild(opt2);
  });

  // رجّع نفس الاختيار القديم لو لسه موجود
  if([...groupFilter.options].some(o => o.value === current)){
    groupFilter.value = current;
  }
}




// initial load
function ensureDefaults(){
  loadDB();
  // if groups empty but there is an uploaded file on server (you gave one), user can import via "استيراد JSON" button.
  if(!db.groups) db.groups = [];
  if(!db.subscribers) db.subscribers = [];
  // if groups empty, create default "عام"
  if(db.groups.length === 0) db.groups.push('عام');
  saveDB();
}
ensureDefaults();
render();
