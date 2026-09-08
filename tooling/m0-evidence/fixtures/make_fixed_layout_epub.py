"""
Build a minimal, self-authored, valid EPUB3 fixed-layout book for the
M0-6 renderer-lock sanity check. Self-authored (no third-party copyrighted
content) so it is safely redistributable/committable.
"""
import zipfile
import os

OUT = os.path.join(os.path.dirname(__file__), "fixed_layout_sample.epub")

CONTAINER_XML = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

CONTENT_OPF = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">m0-fixed-layout-sample</dc:identifier>
    <dc:title>M0 Fixed Layout Sample</dc:title>
    <dc:language>en</dc:language>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">landscape</meta>
    <meta property="rendition:spread">none</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="page1" href="page1.xhtml" media-type="application/xhtml+xml" properties="rendition:layout-pre-paginated"/>
    <item id="page2" href="page2.xhtml" media-type="application/xhtml+xml" properties="rendition:layout-pre-paginated"/>
  </manifest>
  <spine>
    <itemref idref="page1"/>
    <itemref idref="page2"/>
  </spine>
</package>
"""

NAV_XHTML = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Nav</title></head>
<body>
  <nav epub:type="toc">
    <ol>
      <li><a href="page1.xhtml">Page 1</a></li>
      <li><a href="page2.xhtml">Page 2</a></li>
    </ol>
  </nav>
</body>
</html>
"""

def page(n, text):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Page {n}</title>
  <meta name="viewport" content="width=1200, height=800"/>
</head>
<body style="margin:0;width:1200px;height:800px;background:#f0f0f0;">
  <div style="position:absolute;left:100px;top:350px;font-size:48px;font-family:sans-serif;">{text}</div>
</body>
</html>
"""

with zipfile.ZipFile(OUT, "w") as z:
    z.writestr("mimetype", "application/epub+zip", zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", CONTAINER_XML)
    z.writestr("OEBPS/content.opf", CONTENT_OPF)
    z.writestr("OEBPS/nav.xhtml", NAV_XHTML)
    z.writestr("OEBPS/page1.xhtml", page(1, "Fixed Layout Page One"))
    z.writestr("OEBPS/page2.xhtml", page(2, "Fixed Layout Page Two 中文"))

print("wrote", OUT, os.path.getsize(OUT), "bytes")
