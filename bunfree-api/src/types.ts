// ブース検索結果の型定義
type BoothResult = {
    type: string;
    id: number;
    score: number;
    payload: {
        id: number;
        name: string;
        yomi: string;
        category: string;
        area: string;
        area_number: string;
        members: string | null;
        twitter: string | null;
        instagram: string | null;
        website_url: string | null;
        description: string;
        map_number: number;
        position_top: number;
        position_left: number;
        url: string;
        items: {
        id: number;
        booth_id: number;
        name: string;
        yomi: string;
        genre: string;
        author: string;
        item_type: string;
        page_count: number;
        release_date: string;
        price: number;
        url: string;
        page_url: string;
        description: string;
        }[];
    }
};
  
// アイテム検索結果の型定義
type ItemResult = {
type: string;
id: number;
score: number;
payload: {
    id: number;
    booth_id: number;
    name: string;
    yomi: string;
    genre: string;
    author: string;
    item_type: string;
    page_count: number;
    release_date: string;
    price: number;
    url: string;
    page_url: string;
    description: string;
    booth_name: string;
    booth_area: string;
    booth_area_number: string;
    booth_details: {
    id: number;
    name: string;
    yomi: string;
    category: string;
    area: string;
    area_number: string;
    map_number: number;
    members: string | null;
    twitter: string | null;
    instagram: string | null;
    website_url: string | null;
    description: string;
    url: string;
    }
}
};
  
// LLMレスポンスの型定義
type LLMResponse = {
message: string;
boothResults: BoothResult[];
itemResults: ItemResult[];
}

export type { BoothResult, ItemResult, LLMResponse };