import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image,ImageDraw
import personal_characters as personal
import progress


class PersonalCharacterTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.store=self.root/'private'
        frame=Image.new('RGBA',(40,60))
        ImageDraw.Draw(frame).rectangle((10,10,30,50),fill='red')
        self.frames=[]
        for i in range(4):
            p=self.root/f'pose-{i}.png';frame.save(p);self.frames.append(str(p))
        self.config=self.root/'character.json'
        self.config.write_text(json.dumps({'characterFrames':self.frames,'walkFps':8}),encoding='utf-8')

    def save(self,name='我的人物',**kwargs):
        return personal.save_character(self.config,name,confirmed=True,root=self.store,**kwargs)

    def test_requires_confirmation(self):
        with self.assertRaises(ValueError):personal.save_character(self.config,'未确认',root=self.store)
        self.assertFalse(self.store.exists())

    def test_copies_assets_and_preserves_previous_default(self):
        first=self.save(source=self.frames[0])
        self.save('本次人物',make_default=False)
        restored=personal.read_default(self.store)
        self.assertEqual(restored['id'],first['id'])
        self.assertEqual(restored['walkFps'],8)
        self.assertTrue((self.store/first['id']/'original.png').exists())
        for source in self.frames:Path(source).unlink()
        for saved in restored['characterFrames']:self.assertTrue(Path(saved).exists())

    def test_missing_saved_material_is_not_silently_replaced(self):
        self.save()
        stored=personal.read_default(self.store)
        Path(stored['characterFrames'][0]).unlink()
        with self.assertRaises(ValueError):personal.read_default(self.store)

    def test_only_character_styles_load_personal_default(self):
        self.save()
        stored=personal.read_default(self.store)
        (self.root/'video.srt').write_text('1\n00:00:00,000 --> 00:00:01,000\n一句话\n',encoding='utf-8')
        for style in ['soft-white-green','walking-leading','dot-line','short-segments','text-leading']:
            with self.subTest(style=style):
                cfg={'sourceSrt':'video.srt','styleId':style,'barHeight':96,'fontSize':25,
                     'chapters':[{'title':'章节','startCue':1,'endCue':1}]}
                path=self.root/'plan.json';path.write_text(json.dumps(cfg),encoding='utf-8')
                with patch('personal_characters.read_default',return_value=stored) as read:
                    plan=progress.load_plan(path)
                if style in ['walking-leading','text-leading']:
                    self.assertEqual(plan['characterFrames'],stored['characterFrames'])
                    self.assertEqual(plan['walkFps'],8)
                    read.assert_called_once()
                    self.assertEqual(progress.Painter(plan).frame(0).size,(1440,plan['outputHeight']))
                else:read.assert_not_called()
                cfg['characterPreset']='builtin'
                path.write_text(json.dumps(cfg),encoding='utf-8')
                with patch('personal_characters.read_default',side_effect=AssertionError('should not read personal data')):
                    progress.load_plan(path)


if __name__=='__main__':unittest.main()
