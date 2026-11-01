export const CONTENT_KINDS=['coaching','player_community','tournament','promotion','other']
export const STORY_ELEMENTS=['poll','question','link','mention','repost','quiz','countdown']
export function validateStoryLabel(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected one Story label object')
  const fields=['media_id','title','content_kind','sequence_key','slide_position','elements','source']
  if(Object.keys(input).some(k=>!fields.includes(k)))throw Error('Unknown label field')
  const text=(key,max,required=false)=>{const v=input[key];if(v==null&&!required)return null;if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`Invalid ${key}`);return v.trim()}
  const media_id=text('media_id',40,true),title=text('title',160,true),source=text('source',500,true),sequence_key=text('sequence_key',80)
  if(!/^\d+$/.test(media_id))throw Error('Invalid Story ID')
  const content_kind=input.content_kind??null
  if(content_kind!==null&&!CONTENT_KINDS.includes(content_kind))throw Error('Invalid content kind')
  const slide_position=input.slide_position??null
  if(slide_position!==null&&(!sequence_key||!Number.isInteger(slide_position)||slide_position<1||slide_position>100))throw Error('Slide position needs a sequence and integer 1–100')
  const elements=input.elements??null
  if(elements!==null&&(!Array.isArray(elements)||new Set(elements).size!==elements.length||elements.some(e=>!STORY_ELEMENTS.includes(e))))throw Error('Invalid interactive elements')
  return {media_id,title,content_kind,sequence_key,slide_position,elements_json:elements===null?null:JSON.stringify(elements),label_source:source}
}
export function labelStatement(label,at) {
  return {sql:`INSERT INTO story_content(media_id,title,content_kind,sequence_key,slide_position,elements_json,label_source,labeled_at)
    SELECT media_id,?2,?3,?4,?5,?6,?7,?8 FROM media WHERE media_id=?1 AND account='630' AND media_product_type='STORY'
    ON CONFLICT(media_id) DO UPDATE SET title=excluded.title,content_kind=excluded.content_kind,sequence_key=excluded.sequence_key,
    slide_position=excluded.slide_position,elements_json=excluded.elements_json,label_source=excluded.label_source,labeled_at=excluded.labeled_at`,params:[label.media_id,label.title,label.content_kind,label.sequence_key,label.slide_position,label.elements_json,label.label_source,at]}
}
