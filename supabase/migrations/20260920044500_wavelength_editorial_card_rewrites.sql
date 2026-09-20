-- Editorially replace cards that mixed dimensions or repeated the same idea.
with rewrites(left_side, right_side, new_left, new_right) as (values
  ('Plot','Character','Story-first','Character-first'),
  ('Museum','Concert','Quiet museum day','Loud concert night'),
  ('Theater','Couch','Big night out','Cozy night in'),
  ('Jukebox','Algorithm','Choose every song','Let the feed choose'),
  ('Fiction','Documentary','Imagined world','Real world'),
  ('Lyrics','Melody','Words first','Music first'),
  ('Meme','Quote','Quick joke','Lasting line'),
  ('Cover','Original','Familiar version','New version'),
  ('Hero','Antihero','Pure hero','Morally gray'),
  ('Window seat','Aisle seat','Window view','Easy access'),
  ('Private balcony','Private balcony door','Open to the view','Closed for privacy'),
  ('Quiet hotel','Thin hotel walls','Peace and quiet','Can hear everything'),
  ('One bite','One taste','Tiny sample','Full serving'),
  ('Share a straw','Share a secret','Publicly sweet','Privately intimate'),
  ('Music low','Music off','Soft background','Complete silence'),
  ('Lights dim','Lights out','A little visible','Nothing visible'),
  ('Stay for breakfast','Stay until dinner','Short visit','All-day visit'),
  ('Friends with chemistry','Friends with benefits','Keep it platonic','Make it physical')
)
update public.game_content c
set payload = jsonb_set(jsonb_set(c.payload, '{left}', to_jsonb(r.new_left)), '{right}', to_jsonb(r.new_right))
from rewrites r
where c.content_type = 'wavelength-spectrum'
  and c.payload->>'left' = r.left_side
  and c.payload->>'right' = r.right_side;
