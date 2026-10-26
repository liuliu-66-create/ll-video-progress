"""Keep confirmed personal characters inside this local Skill, outside Git."""
import argparse
import json
from pathlib import Path
import shutil
import uuid
from PIL import Image

PERSONAL_ROOT=Path(__file__).resolve().parent.parent/'user-data'/'characters'


def read_default(root=PERSONAL_ROOT):
    root=Path(root).resolve()
    pointer=root/'default.json'
    if not pointer.exists():return None
    identifier=json.loads(pointer.read_text(encoding='utf-8'))['id']
    if not isinstance(identifier,str) or len(identifier)!=32 or any(c not in '0123456789abcdef' for c in identifier):
        raise ValueError('个人默认人物记录无效，请重新选择已保存的人物')
    folder=root/identifier
    profile=json.loads((folder/'character.json').read_text(encoding='utf-8'))
    frames=[]
    for relative in profile['characterFrames']:
        frame=(folder/relative).resolve()
        if not frame.is_relative_to(folder) or not frame.is_file():
            raise ValueError('个人默认人物素材缺失，请用户补齐，不要静默替换为内置人物')
        frames.append(str(frame))
    if not 4<=len(frames)<=32:raise ValueError('个人默认人物需要 4–32 帧动作图')
    return {**profile,'characterFrames':frames,'profilePath':str(folder/'character.json')}


def save_character(config_path,name,source=None,confirmed=False,make_default=True,root=PERSONAL_ROOT):
    if not confirmed:raise ValueError('人物效果必须先经用户确认，才能保存复用')
    if not isinstance(name,str) or not name.strip():raise ValueError('请给人物填写名称')
    config_path=Path(config_path).resolve()
    cfg=json.loads(config_path.read_text(encoding='utf-8-sig'))
    frames=cfg.get('characterFrames')
    if not isinstance(frames,list) or not 4<=len(frames)<=32:raise ValueError('需要 4–32 帧动作图')
    paths=[(config_path.parent/p).resolve() for p in frames]
    for path in paths:
        with Image.open(path) as image:
            alpha=image.convert('RGBA').getchannel('A')
            if not alpha.getbbox() or alpha.getextrema()[0]!=0:
                raise ValueError('动作帧需要可见人物与透明背景：'+str(path))
    if source:
        source=Path(source).resolve()
        with Image.open(source) as image:image.verify()
    fps=cfg.get('walkFps',10)
    if isinstance(fps,bool) or not isinstance(fps,int) or not 1<=fps<=30:raise ValueError('walkFps 应为 1–30 的整数')
    root=Path(root).resolve()
    identifier=uuid.uuid4().hex
    folder=root/identifier
    folder.mkdir(parents=True)
    saved=[]
    for i,path in enumerate(paths,1):
        filename=f'walk-{i:02d}.png'
        with Image.open(path) as image:image.convert('RGBA').save(folder/filename)
        saved.append(filename)
    if source:shutil.copy2(source,folder/('original'+source.suffix))
    profile={'id':identifier,'name':name.strip(),'characterFrames':saved,'walkFps':fps,
             'layout':{'heightToBarRatio':1,'maxOverhangToBarRatio':0.5},'confirmed':True}
    (folder/'character.json').write_text(json.dumps(profile,ensure_ascii=False,indent=2),encoding='utf-8')
    if make_default:
        temporary=root/(identifier+'.tmp')
        temporary.write_text(json.dumps({'id':identifier}),encoding='utf-8')
        temporary.replace(root/'default.json')
    return profile


def main():
    parser=argparse.ArgumentParser()
    sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('show')
    save=sub.add_parser('save')
    save.add_argument('--config',type=Path,required=True)
    save.add_argument('--name',required=True)
    save.add_argument('--source',type=Path)
    save.add_argument('--confirmed',action='store_true')
    save.add_argument('--this-time-only',action='store_true')
    args=parser.parse_args()
    result=read_default() if args.command=='show' else save_character(args.config,args.name,args.source,args.confirmed,not args.this_time_only)
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
