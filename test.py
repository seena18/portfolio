from io import StringIO

import pandas as pd
import requests


url = (
    "https://docs.google.com/document/d/e/2PACX-1vSvM5gDlNvt7npYHhp_XfsJvuntUhq184By5xO_pA4b_gCWeXb6dM6ZxwN8rE6S4ghUsCj2VKR21oEP/pub"
)


def display_character_grid(document_url: str) -> None:
    response = requests.get(document_url, timeout=30)
    response.raise_for_status()
    response.encoding = "utf-8"

    df = pd.read_html(StringIO(response.text), header=0)[0]
    df.columns = [str(column).strip() for column in df.columns]

    df["x-coordinate"] = pd.to_numeric(df["x-coordinate"]).astype(int)
    df["y-coordinate"] = pd.to_numeric(df["y-coordinate"]).astype(int)
    df["Character"] = df["Character"].astype(str)

    characters = {
        (row["x-coordinate"], row["y-coordinate"]): row["Character"]
        for _, row in df.iterrows()
    }

    max_x = df["x-coordinate"].max()
    max_y = df["y-coordinate"].max()

    for y in range(max_y, -1, -1):
        line = "".join(
            characters.get((x, y), " ")
            for x in range(max_x + 1)
        )
        print(line.rstrip())


display_character_grid(url)