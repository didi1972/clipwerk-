import * as ResEdit from 'resedit';
import * as PELibrary from 'pe-library';
import fs from 'fs';
const exePath = process.argv[2], icoPath = process.argv[3];
const exe = PELibrary.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = PELibrary.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const id = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if (vi) {
  vi.setStringValues({ lang: 1033, codepage: 1200 }, { FileDescription: 'Clipwerk Studio', ProductName: 'Clipwerk Studio', CompanyName: 'Clipwerk', OriginalFilename: 'Clipwerk.exe', InternalName: 'Clipwerk', LegalCopyright: 'Kostenlos' });
  vi.setFileVersion(1, 2, 0, 0, 1033); vi.setProductVersion(1, 2, 0, 0, 1033);
  vi.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('icon + version set');
