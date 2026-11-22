import { Inject, Injectable } from 'di-xxl';

import { Move } from '@scaljeri/chess-shared';
import { BrowserChessPiece } from '../../../utils/chess-piece';
import { IBrowserSettings } from '../../../../models/browser-settings';
import { IDisplay } from '../../../interfaces/display';
import { IChessBoard } from '../../../../models/chessboard';
import { GameState } from './game-state';
import {
    thinkMs,
    reachMs,
    jitterPoint,
    dragPath,
    fireDown,
    fireUp,
    maybeGlance,
    sleep,
} from '../../../utils/human';

@Injectable({ name: 'browser.context.live.utils.mover', singleton: true })
export class LiveMover extends BrowserChessPiece {
    @Inject('chessboard') chessBoard: IChessBoard;
    @Inject('settings') settings: IBrowserSettings;
    @Inject('game-state') game: GameState;
    @Inject('display') display: IDisplay;

    async move(move: Move): Promise<void> {
        const piece = this.chessBoard.findPiece(move.from);
        const rawFrom = this.chessBoard.findCoordinates(move.from);
        const rawTo = this.chessBoard.findCoordinates(move.to);

        // square size on this board instance
        const board = document.querySelector(this.settings.BOARD_NAME) as HTMLElement;
        const squareSize = board ? board.getBoundingClientRect().width / 8 : 80;

        // land off-center on both ends; human never clicks dead pixel of a square
        const from = jitterPoint(rawFrom, squareSize);
        const to = jitterPoint(rawTo, squareSize);

        // simulated thinking window: engine already returned a move, we delay the physical input.
        const moveIdx = ((this.game as any)?.get?.()?.moves?.length) ?? 0;
        const think = thinkMs(moveIdx, squareSize);
        await sleep(think);

        // approach phase: brief hesitation, then pointerdown on the piece's parent
        await sleep(reachMs());

        const boardEl = board || (piece.parentElement as HTMLElement);
        const pieceParent = piece.parentElement as HTMLElement;

        fireDown(pieceParent, from);

        // sometimes glance at a decoy square mid-drag — reconsidering motion
        await maybeGlance(boardEl, from, to, squareSize);

        // drag the piece along a human bezier path to the destination
        await dragPath(boardEl, from, to, squareSize);

        // settle on the target before releasing
        await sleep(40 + Math.random() * 120);

        fireUp(boardEl, to);

        if (move.promoteTo) {
            // small extra beat before clicking the promotion piece
            await sleep(180 + Math.random() * 220);
            this.promote(move.promoteTo, move.color);
        }
    }
}
