-- Исправляем названия статей 57, 58, 59
UPDATE disease_articles_565 
SET title = 'Болезни пищевода, кишечника (кроме двенадцатиперстной кишки) и брюшины (в том числе врожденные)', updated_at = now()
WHERE article_number = '57';

UPDATE disease_articles_565 
SET title = 'Язвенная болезнь желудка, двенадцатиперстной кишки', updated_at = now()
WHERE article_number = '58';

UPDATE disease_articles_565 
SET title = 'Другие болезни желудка и двенадцатиперстной кишки, болезни печени, желчного пузыря, желчевыводящих путей и поджелудочной железы', updated_at = now()
WHERE article_number = '59';