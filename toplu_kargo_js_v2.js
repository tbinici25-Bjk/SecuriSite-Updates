    // ==================== TOPLU KARGO (v2 — profesyonel) ====================
    let topluKargoSecilenler = new Map(); // key: "block|apt", value: {block, apt, name}

    function topluKargoAc() {
      topluKargoSecilenler.clear();
      document.getElementById('topluKargoArama').value = '';
      document.getElementById('topluKargoSonuc').style.display = 'none';
      topluKargoListeYukle();
      topluKargoSecilenleriGoster();
      topluKargoSayacGuncelle();
      document.getElementById('topluKargoModal').style.display = 'flex';
    }

    function topluKargoKapat() {
      document.getElementById('topluKargoModal').style.display = 'none';
    }

    let topluKargoTumSakinler = [];

    async function topluKargoListeYukle() {
      const liste = document.getElementById('topluKargoListe');
      liste.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">Yükleniyor...</div>';
      try {
        const tumSakinler = await fetch('/api/residents').then(r => r.json());
        if (!tumSakinler || tumSakinler.length === 0) {
          liste.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">Kayıtlı daire bulunamadı.</div>';
          return;
        }
        tumSakinler.sort((a, b) => {
          if (a.block !== b.block) return a.block.localeCompare(b.block);
          return a.apartment_no - b.apartment_no;
        });
        topluKargoTumSakinler = tumSakinler;
        topluKargoListeRender();
      } catch (e) {
        liste.innerHTML = '<div style="text-align:center; color:#e74c3c; padding:20px;">Liste yüklenemedi.</div>';
      }
    }

    function topluKargoListeRender() {
      const liste = document.getElementById('topluKargoListe');
      liste.innerHTML = topluKargoTumSakinler.map(r => {
        const key = `${r.block}|${r.apartment_no}`;
        const secili = topluKargoSecilenler.has(key);
        return `
          <label class="tk-satir" data-key="${key}" data-arama="${(r.name + ' ' + r.block + ' ' + r.apartment_no + ' ' + r.block + '-' + r.apartment_no).toLowerCase()}"
            style="display:flex; align-items:center; gap:10px; padding:10px; border-radius:6px; cursor:pointer; margin-bottom:4px; background:${secili ? 'rgba(74,158,255,0.15)' : ''};">
            <input type="checkbox" value="${key}" ${secili ? 'checked' : ''} onchange="topluKargoSecim(this, '${r.block}', ${r.apartment_no}, '${(r.name||'').replace(/'/g, "\\'")}')"
              style="width:18px; height:18px; cursor:pointer;">
            <span style="font-weight:bold; color:var(--accent,#4a9eff); min-width:60px;">${r.block}-${r.apartment_no}</span>
            <span style="color:var(--text,#fff); flex:1;">${r.name}</span>
            <span style="color:var(--text-muted,#888); font-size:12px;">${r.phone || ''}</span>
          </label>
        `;
      }).join('');
    }

    function topluKargoSecim(checkbox, block, apt, name) {
      const key = `${block}|${apt}`;
      if (checkbox.checked) {
        topluKargoSecilenler.set(key, { block, apt, name });
        checkbox.closest('.tk-satir').style.background = 'rgba(74,158,255,0.15)';
      } else {
        topluKargoSecilenler.delete(key);
        checkbox.closest('.tk-satir').style.background = '';
      }
      topluKargoSecilenleriGoster();
      topluKargoSayacGuncelle();
    }

    // Seçilen daireleri üstte etiket olarak göster
    function topluKargoSecilenleriGoster() {
      const kutu = document.getElementById('topluKargoSecilenKutu');
      if (topluKargoSecilenler.size === 0) {
        kutu.style.display = 'none';
        kutu.innerHTML = '';
        return;
      }
      kutu.style.display = 'flex';
      kutu.innerHTML = Array.from(topluKargoSecilenler.entries()).map(([key, v]) => `
        <span style="display:inline-flex; align-items:center; gap:6px; background:var(--accent,#4a9eff); color:#fff; padding:4px 10px; border-radius:20px; font-size:13px; font-weight:500;">
          ${v.block}-${v.apt}
          <span onclick="topluKargoEtiketKaldir('${key}')" style="cursor:pointer; font-weight:bold; font-size:16px; line-height:1;">&times;</span>
        </span>
      `).join('');
    }

    function topluKargoEtiketKaldir(key) {
      topluKargoSecilenler.delete(key);
      // Listedeki checkbox'ı da güncelle
      const satir = document.querySelector(`.tk-satir[data-key="${key}"]`);
      if (satir) {
        const cb = satir.querySelector('input[type=checkbox]');
        if (cb) cb.checked = false;
        satir.style.background = '';
      }
      topluKargoSecilenleriGoster();
      topluKargoSayacGuncelle();
    }

    function topluKargoSayacGuncelle() {
      const sayi = topluKargoSecilenler.size;
      document.getElementById('topluKargoSayac').textContent = `${sayi} daire seçildi`;
      const btn = document.getElementById('topluKargoGonderBtn');
      btn.disabled = sayi === 0;
      btn.style.opacity = sayi === 0 ? '0.5' : '1';
      btn.textContent = sayi === 0 ? 'Seçilenlere Gönder' : `Seçilenlere Gönder (${sayi})`;
    }

    function topluKargoFiltrele() {
      const q = document.getElementById('topluKargoArama').value.toLowerCase().trim();
      document.querySelectorAll('.tk-satir').forEach(satir => {
        const arama = satir.getAttribute('data-arama');
        satir.style.display = (!q || arama.includes(q)) ? 'flex' : 'none';
      });
    }

    function topluKargoTumunuTemizle() {
      topluKargoSecilenler.clear();
      document.querySelectorAll('#topluKargoListe input[type=checkbox]').forEach(cb => {
        cb.checked = false;
        cb.closest('.tk-satir').style.background = '';
      });
      topluKargoSecilenleriGoster();
      topluKargoSayacGuncelle();
    }

    async function topluKargoGonder() {
      if (topluKargoSecilenler.size === 0) return;
      const btn = document.getElementById('topluKargoGonderBtn');
      const sonucDiv = document.getElementById('topluKargoSonuc');
      btn.disabled = true;
      btn.textContent = '⏳ Gönderiliyor...';

      const secilenler = Array.from(topluKargoSecilenler.values());
      let basarili = 0, basarisiz = 0;
      const sonuclar = [];

      for (const item of secilenler) {
        try {
          const resp = await fetch('/api/entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'kargo',
              block: item.block,
              apartment_no: item.apt,
              visitor_name: ''
            })
          });
          const data = await resp.json();
          if (resp.ok && data.success) {
            basarili++;
            sonuclar.push(`✅ ${item.block}-${item.apt} (${data.resident || '-'})`);
          } else {
            basarisiz++;
            sonuclar.push(`❌ ${item.block}-${item.apt}: ${data.error || 'hata'}`);
          }
        } catch (e) {
          basarisiz++;
          sonuclar.push(`❌ ${item.block}-${item.apt}: bağlantı hatası`);
        }
      }

      sonucDiv.style.display = 'block';
      sonucDiv.innerHTML = `
        <div style="font-weight:bold; margin-bottom:8px;">Tamamlandı: ${basarili} başarılı, ${basarisiz} başarısız</div>
        ${sonuclar.join('<br>')}
      `;

      btn.textContent = 'Tekrar Gönder';
      btn.disabled = false;

      if (basarisiz === 0) {
        setTimeout(() => {
          topluKargoTumunuTemizle();
          sonucDiv.style.display = 'none';
        }, 3000);
      }
    }
