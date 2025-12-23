const fs = require('fs');
const path = require('path');

// Certificate/bootstrap helper for Prisma DB connections
function setupCerts() {
  // Skip certificate setup in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log('Modo desenvolvimento: pulando configuração de certificados SSL');
    return;
  }

  const certDir = path.join(__dirname, '..', 'prisma', 'certs');
  const fallbackCertsDir = path.join(__dirname, '..', 'certificados');
  const p12Path = path.join(certDir, 'client-identity.p12');
  const b64Path = path.join(certDir, 'client-identity.p12.b64');

  console.log('Verificando chaves em prisma/certs');

  try {
    console.log('Iniciando configuração de certificados Prisma');
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }

    // If deploy placed PEMs in backend/certificados, copy them into prisma/certs
    try {
      if (fs.existsSync(fallbackCertsDir)) {
        console.log('Chaves encontradas em /certificados, copiando para prisma/certs');
        const maybeFiles = [
          // common deployed names -> destination name in prisma/certs
          ['client-cert.pem', path.join(certDir, 'client-cert.pem')],
          ['certificate.pem', path.join(certDir, 'client-cert.pem')],
          ['client-key.pem', path.join(certDir, 'client-key.pem')],
          ['private-key.key', path.join(certDir, 'client-key.pem')],
          ['ca-certificate.crt', path.join(certDir, 'ca-certificate.crt')],
          ['client-identity.p12', path.join(certDir, 'client-identity.p12')],
        ];
        for (const [name, dest] of maybeFiles) {
          const src = path.join(fallbackCertsDir, name);
          if (fs.existsSync(src) && !fs.existsSync(dest)) {
            try {
              fs.copyFileSync(src, dest);
              try {
                if (name === 'client-key.pem' || name === 'private-key.key')
                  fs.chmodSync(dest, 0o600);
              } catch (e) {}
              console.log(`Copiado ${src} -> ${dest}`);
            } catch (e) {
              // ignore copy errors
            }
          }
        }
      }
    } catch (e) {
      // ignore fallback copy errors
    }

    // Priority: PRISMA_P12_BASE64 env var, then existing .b64 file
    if (process.env.PRISMA_P12_BASE64) {
      // Normalize env-provided base64: remove whitespace/newlines that UI panels might add
      try {
        const normalized = process.env.PRISMA_P12_BASE64.replace(/\s+/g, '');
        const buf = Buffer.from(normalized, 'base64');
        if (buf.length < 200) {
          console.warn(
            `Chaves incorretas: PRISMA_P12_BASE64 decodificado para ${buf.length} bytes — muito pequeno, recusando escrever client-identity.p12 (provavelmente truncado).`
          );
        } else {
          fs.writeFileSync(p12Path, buf);
          console.log(`Escrito ${p12Path} a partir de PRISMA_P12_BASE64 (${buf.length} bytes)`);
        }
      } catch (e) {
        console.warn(
          'Falha ao escrever client-identity.p12 a partir de PRISMA_P12_BASE64:',
          e && e.message ? e.message : e
        );
      }
      // Try to extract PEMs from the P12 so libpq can use PEMs if PKCS#12 handling fails
      try {
        const forge = require('node-forge');
        const normalized = process.env.PRISMA_P12_BASE64.replace(/\s+/g, '');
        const raw = Buffer.from(normalized, 'base64');
        const p12Asn1 = forge.asn1.fromDer(raw.toString('binary'));
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, process.env.P12_PASSWORD || '');

        // extract key and certs
        let keyPem, certPem, caPem;
        for (const safeContent of p12.safeContents) {
          for (const safeBag of safeContent.safeBags) {
            if (
              safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag ||
              safeBag.type === forge.pki.oids.keyBag
            ) {
              const keyObj = safeBag.key;
              keyPem = forge.pki.privateKeyToPem(keyObj);
            }
            if (safeBag.type === forge.pki.oids.certBag) {
              const certObj = safeBag.cert;
              const pem = forge.pki.certificateToPem(certObj);
              if (!certPem) certPem = pem;
              else caPem = (caPem || '') + pem;
            }
          }
        }

        if (keyPem && certPem) {
          const certPemPath = path.join(certDir, 'client-cert.pem');
          const keyPemPath = path.join(certDir, 'client-key.pem');
          const caPemPath = path.join(certDir, 'ca-certificate.crt');
          fs.writeFileSync(certPemPath, certPem);
          fs.writeFileSync(keyPemPath, keyPem);
          if (caPem) fs.writeFileSync(caPemPath, caPem);
          try {
            fs.chmodSync(keyPemPath, 0o600);
          } catch (e) {
            // ignore chmod errors on platforms that don't support it
          }
          console.log(
            `PEM extraídos: cert=${certPemPath} (${Buffer.byteLength(
              certPem
            )} bytes), key=${keyPemPath} (${Buffer.byteLength(keyPem)} bytes)`
          );

          process.env.PGSSLCERT = process.env.PGSSLCERT || certPemPath;
          process.env.PGSSLKEY = process.env.PGSSLKEY || keyPemPath;
          if (fs.existsSync(caPemPath))
            process.env.PGSSLROOTCERT = process.env.PGSSLROOTCERT || caPemPath;

          try {
            if (process.env.DATABASE_URL) {
              let dburl = process.env.DATABASE_URL.replace(
                /([?&])sslidentity=[^&]*/g,
                '$1'
              ).replace(/([?&])sslpassword=[^&]*/g, '$1');
              dburl = dburl.replace(/[?&]$/g, '');
              if (!/sslcert=/.test(dburl)) {
                const sep2 = dburl.includes('?') ? '&' : '?';
                const sslParamsPem =
                  `sslmode=verify-ca&sslcert=${encodeURIComponent(
                    certPemPath
                  )}&sslkey=${encodeURIComponent(keyPemPath)}` +
                  (fs.existsSync(caPemPath) ? `&sslrootcert=${encodeURIComponent(caPemPath)}` : '');
                dburl = dburl + sep2 + sslParamsPem;
              }
              process.env.DATABASE_URL = dburl;
              console.log('DATABASE_URL reescrita para preferir parâmetros SSL PEM');
            }
          } catch (e) {
            console.warn(
              'Falha ao reescrever DATABASE_URL para PEMs:',
              e && e.message ? e.message : e
            );
          }
        }
      } catch (e) {
        console.warn('Extração PKCS#12 -> PEM falhou (não fatal):', e && e.message ? e.message : e);
      }
    } else if (fs.existsSync(b64Path) && !fs.existsSync(p12Path)) {
      const b64 = fs.readFileSync(b64Path, 'utf8');
      const buf = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
      fs.writeFileSync(p12Path, buf);
      console.log(`Escrito ${p12Path} a partir do arquivo ${b64Path} (${buf.length} bytes)`);
    }

    if (process.env.DATABASE_URL) {
      let dburl = process.env.DATABASE_URL.replace(/([?&])sslidentity=[^&]*/g, '$1').replace(
        /([?&])sslpassword=[^&]*/g,
        '$1'
      );
      dburl = dburl.replace(/[?&]$/g, '');

      const sep = dburl.includes('?') ? '&' : '?';

      const certPem = path.join(certDir, 'client-cert.pem');
      const keyPem = path.join(certDir, 'client-key.pem');
      const caPem = path.join(certDir, 'ca-certificate.crt');

      if (
        fs.existsSync(certPem) &&
        fs.existsSync(keyPem) &&
        fs.existsSync(caPem) &&
        !/sslcert=/i.test(dburl)
      ) {
        const absCert = path.resolve(certPem);
        const absKey = path.resolve(keyPem);
        const absCa = path.resolve(caPem);
        const sslParams =
          `sslmode=verify-ca&sslcert=${encodeURIComponent(absCert)}` +
          `&sslkey=${encodeURIComponent(absKey)}&sslrootcert=${encodeURIComponent(absCa)}`;
        dburl = dburl + sep + sslParams;
        process.env.DATABASE_URL = dburl;
        console.log('Parâmetros SSL PEM anexados à DATABASE_URL (preferido sobre sslidentity)');
      } else if (process.env.P12_PASSWORD && fs.existsSync(p12Path)) {
        let p12Size = 0;
        try {
          p12Size = fs.statSync(p12Path).size;
        } catch (e) {}
        if (p12Size > 200 && !/sslidentity=/i.test(dburl)) {
          const encoded = encodeURIComponent(process.env.P12_PASSWORD);
          const absP12 = path.resolve(certDir, 'client-identity.p12');
          const sslParam = `sslidentity=${encodeURIComponent(absP12)}&sslpassword=${encoded}`;
          dburl = dburl + sep + sslParam;
          process.env.DATABASE_URL = dburl;
          console.log('sslidentity anexado à DATABASE_URL (PKCS#12 usado)');
        } else {
          process.env.DATABASE_URL = dburl;
          console.warn(
            `Não anexando sslidentity: tamanho de client-identity.p12=${p12Size} bytes (muito pequeno ou ausente)`
          );
        }
      } else {
        process.env.DATABASE_URL = dburl;
      }
    }
    console.log('Configuração de certificados Prisma concluída');
  } catch (err) {
    console.warn(
      'Aviso ao configurar certificados Prisma:',
      err && err.message ? err.message : err
    );
  }
}

module.exports = { setupCerts };

// mark that we've run cert setup so other modules can avoid duplicate work
try {
  process.env.__CERTS_BOOTSTRAPPED = '1';
} catch (e) {
  // ignore
}
