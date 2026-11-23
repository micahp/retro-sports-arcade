from PIL import Image, ImageDraw; import glob, sys
for seq in ["skate","shoot","check"]:
  for k in "ABC":
    fs = sorted(glob.glob(f"frames/{seq}_{k}_*.png"))
    W, H = 300, 169; cols = 6; rows = (len(fs)+cols-1)//cols
    sheet = Image.new("RGB", (cols*W, rows*H), "black")
    for i,f in enumerate(fs):
      im = Image.open(f).convert("RGB").resize((W,H), Image.NEAREST)
      ImageDraw.Draw(im).text((4,2), str(i), fill=(255,0,0))
      sheet.paste(im, ((i%cols)*W, (i//cols)*H))
    sheet.save(f"frames/sheet_{seq}_{k}.png")
